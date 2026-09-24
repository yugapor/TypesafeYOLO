# TypeSafe YOLO for Pi

English | [日本語](README.ja.md)

A [Pi Coding Agent](https://pi.dev/) extension that lets you write automatic approval rules in natural language.
[TypeSafe AI](https://typesafe.ai/) classifies proposed operations and routes them to allow, ask, or deny.

## Installation

Once published to npm, install the extension through Pi (the package is not yet published).

```sh
pi install npm:pi-typesafe-yolo
```

Set the `TYPESAFE_API_KEY` environment variable to your TypeSafe AI API key, then start Pi.
If Pi was running when you installed the extension, use `/reload` to load it.

## Filter

The default filter allows routine development work and asks before operations such as publishing or deploying.
To use your own rules, create `~/.pi/agent/typesafe-yolo.md`.
This file replaces the default filter.

```text
Automatically allow routine development work and dependency installation.
Ask before changes outside the working directory, Git push, or deployment.
Deny sending credentials to external destinations.
Ask when an operation cannot be confidently assessed.
```

When an operation requires confirmation, choose one of the following:

- **Accept**: Allow this operation once.
- **Deny**: Reject this operation and inform the agent.
- **User feedback**: Reject this operation and pass your instructions to the agent. Any revised operation is classified again.

Dismissing the selection, leaving feedback blank, or cancelling feedback does not approve the operation.
Classification failures also require confirmation. In non-interactive mode, operations that require confirmation are blocked.
Use `/reload` to apply changes to your filter.
If you set `PI_CODING_AGENT_DIR`, place `typesafe-yolo.md` in that directory instead.

The filter and tool arguments are sent to TypeSafe AI, including any code or secrets in those arguments.
AI classification can make mistakes.
