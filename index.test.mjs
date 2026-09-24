import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { decisionOf } from "./index.ts";

test("the tool gate allows, asks, denies, and stays closed on failure or cancellation", async (t) => {
  const result = (choice, probabilities) => ({ type: "choice", choice, probabilities });
  const allow = result("allow", { allow: 0.99, ask: 0.005, deny: 0.005 });
  const deny = result("deny", { allow: 0.005, ask: 0.005, deny: 0.99 });
  const uncertain = result("allow", { allow: 0.8, ask: 0.15, deny: 0.05 });
  assert.equal(decisionOf(allow), "allow");
  assert.equal(decisionOf(deny), "deny");
  for (const invalid of [null, {}, uncertain, result("allow", { allow: 1 }),
    result("allow", { allow: 1, ask: 1, deny: 1 }),
    result("allow", { allow: NaN, ask: 0, deny: 0 })]) {
    assert.equal(decisionOf(invalid), "ask");
  }

  const previousKey = process.env.TYPESAFE_API_KEY;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = mkdtempSync(join(tmpdir(), "typesafe-yolo-test-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.TYPESAFE_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  });
  async function load() {
    const loaded = await discoverAndLoadExtensions(
      [fileURLToPath(new URL(".", import.meta.url))], agentDir, agentDir,
    );
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, 1);
    const handlers = loaded.extensions[0].handlers.get("tool_call");
    assert.equal(handlers.length, 1);
    return handlers[0];
  }
  let handler = await load();
  let apiAnswer = allow;
  let unavailable = false;
  let expectedFilter = "通常の開発作業";
  const requests = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body), expectedFilter });
    if (unavailable) throw new Error("offline");
    return Response.json({ answers: { decision: apiAnswer } });
  });
  const event = { toolName: "bash", input: { command: "echo hello" } };
  const controller = new AbortController();
  let approval;
  let feedback;
  let onSelect;
  let onInput;
  let inputs = 0;
  let prompts = 0;
  const ctx = {
    signal: controller.signal, cwd: process.cwd(), hasUI: true,
    ui: { async select(_message, choices, options) {
      prompts++;
      assert.deepEqual(choices, ["Deny", "Accept", "User feedback"]);
      assert.equal(options.signal, ctx.signal);
      onSelect?.();
      return approval;
    }, async input(_message, _placeholder, options) {
      inputs++;
      assert.equal(options.signal, ctx.signal);
      onInput?.();
      return feedback;
    } },
  };
  assert.equal(await handler(event, ctx), undefined);
  // User preferences live outside the installed package and change only on reload.
  writeFileSync(join(agentDir, "typesafe-yolo.md"), "自分のFilter: 公開は確認する。");
  assert.equal(await handler(event, ctx), undefined);
  handler = await load();
  expectedFilter = "自分のFilter";
  assert.equal(await handler(event, ctx), undefined);
  // Pi can supply a context without an active operation's cancellation signal.
  assert.equal(await handler(event, { ...ctx, signal: undefined }), undefined);
  apiAnswer = deny;
  assert.equal((await handler(event, ctx)).block, true);
  assert.equal(prompts, 0);
  apiAnswer = uncertain;
  assert.equal((await handler(event, ctx)).block, true); // Dismissal is not approval.
  approval = "Deny";
  assert.match((await handler(event, ctx)).reason, /user did not approve/);
  approval = "Accept";
  assert.equal(await handler(event, ctx), undefined);
  assert.equal(inputs, 0);
  approval = "User feedback";
  feedback = "  削除せず、変更案だけ提示してください。  ";
  const rejected = await handler(event, ctx);
  assert.equal(rejected.block, true);
  assert.ok(rejected.reason.endsWith(feedback.trim()));
  for (feedback of [undefined, "", "   "]) {
    assert.match((await handler(event, ctx)).reason, /user did not approve/);
  }
  // Feedback grants no permission to the next call: it is classified again.
  apiAnswer = deny;
  const promptsBeforeRetry = prompts;
  const callsBeforeRetry = fetchMock.mock.callCount();
  assert.equal((await handler(event, ctx)).block, true);
  assert.equal(prompts, promptsBeforeRetry);
  assert.equal(fetchMock.mock.callCount(), callsBeforeRetry + 1);
  apiAnswer = uncertain;
  unavailable = true;
  approval = "Accept";
  assert.equal(await handler(event, ctx), undefined); // Manual review still works offline.
  ctx.hasUI = false;
  assert.equal((await handler(event, ctx)).block, true);
  ctx.hasUI = true;
  // A late selection or text response cannot approve an aborted operation.
  onSelect = () => controller.abort();
  assert.match((await handler(event, ctx)).reason, /cancelled/);
  onSelect = undefined;
  const inputController = new AbortController();
  ctx.signal = inputController.signal;
  approval = "User feedback";
  feedback = "Try another approach.";
  onInput = () => inputController.abort();
  assert.match((await handler(event, ctx)).reason, /cancelled/);
  controller.abort();
  const calls = fetchMock.mock.callCount();
  assert.equal((await handler(event, ctx)).block, true);
  assert.equal(fetchMock.mock.callCount(), calls);
  writeFileSync(join(agentDir, "typesafe-yolo.md"), "   ");
  handler = await load();
  ctx.signal = new AbortController().signal;
  assert.match((await handler(event, ctx)).reason, /non-empty filter/);
  assert.equal(fetchMock.mock.callCount(), calls);
  // Check requests outside the fetch mock, where the gate cannot catch assertions.
  for (const { url, body, expectedFilter } of requests) {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.ok(body.questions.decision.instructions.filter.includes(expectedFilter));
    assert.equal(body.state.tool, "bash");
    assert.equal(body.state.input.command, "echo hello");
  }
});
