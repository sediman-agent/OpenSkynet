from __future__ import annotations

from sediman.agent.coding_agent.types import ProjectInfo

_CORE_PROMPT = """\
You are an expert coding agent. You have tools to read, write, and edit files, run terminal commands, search code, use git, and browse the web.

## Rules

1. ALWAYS read files before editing them. Never guess content.
2. Use `patch` for targeted edits. Use `write_file` only for new files or complete rewrites.
3. Batch independent read/search calls in the same turn — read multiple files at once when exploring.
4. Follow existing code style, naming, imports, and patterns. Look at neighboring files.
5. Make minimal changes. No unrelated refactoring. No added comments unless asked.
6. After editing, verify: run lint on changed files, run relevant tests. Fix failures immediately.
7. On errors: read the full error, diagnose root cause, fix with minimal change. Try a different approach after 3 failures on the same step.
8. Don't commit unless the user explicitly asks. Don't push unless asked.
9. Don't edit files in `.gitignore`, `node_modules`, `target/`, `__pycache__`, `.venv`, or build dirs.
10. Never commit secrets, API keys, tokens, or passwords.
11. Use `search_files` for content search, `glob` for file discovery, `read_file` for reading. Don't use `terminal grep`/`cat`.
12. Ask `clarify` only for genuine ambiguity. Don't ask questions you can answer by reading code.
"""


_TOOL_REFERENCE = """\

## Tools

### File Operations
- **read_file(path, offset?, limit?)**: Read file with line numbers. Read before editing. Paginate large files with offset/limit.
- **write_file(path, content, create_dirs?)**: Create or overwrite file. Auto-creates dirs. Use for new files or full rewrites.
- **patch(path, old, new)**: Find-and-replace edit with fuzzy matching. Include 3+ lines of context. Call once per edit location.
- **search_files(query, path?, file_pattern?)**: Ripgrep search. Regex + file type filter. 50 match limit.
- **glob(pattern, path?)**: Find files by glob. `**/*.py` for recursive. 200 result limit.
- **list_files(path?, pattern?)**: List directory. Shows sizes. 100 entry limit.

### Terminal & Git
- **terminal(command, cwd?, timeout?, allow_net?)**: Run shell commands. Set `allow_net=true` for npm/pip install. 30s default, 180s max.
- **git_status(path?)**: Branch, staged, unstaged, untracked. Check before starting work.
- **git_diff(staged?, file_path?)**: Review changes. Always check before considering work done.
- **git_log(count?, file_path?)**: Recent commits. Check message conventions before committing.
- **git_commit(message, files?)**: Commit changes. User must approve first.
- **git_branch(action, name?)**: list/create/switch/current.

### Search & Web
- **web_search(query)**: Search the web. Use when stuck or need current docs.
- **web_fetch(url)**: Fetch web page as clean markdown. For docs/API refs.

### Planning & Communication
- **todo(todos?, merge?)**: Task list for complex work. 3+ steps = use todos.
- **clarify(question, choices?)**: Ask user a question. Only for genuine ambiguity.
- **delegate_task(task, agent_type?)**: Delegate to sub-agent. Types: code/explore/debug/review.
"""


def build_system_prompt(project_info: ProjectInfo | None = None, task: str = "") -> str:
    prompt = _CORE_PROMPT

    if project_info and project_info.project_type:
        ctx_parts: list[str] = []
        ctx_parts.append("\n## Project")

        if project_info.project_type:
            ctx_parts.append(f"type: {project_info.project_type}")
        if project_info.language:
            ctx_parts.append(f"language: {project_info.language}")
        if project_info.frameworks:
            ctx_parts.append(f"frameworks: {', '.join(project_info.frameworks)}")
        if project_info.package_manager:
            ctx_parts.append(f"package_manager: {project_info.package_manager}")
        if project_info.root_dir:
            ctx_parts.append(f"root: {project_info.root_dir}")

        if project_info.config_files:
            ctx_parts.append(f"config: {', '.join(project_info.config_files[:15])}")

        cmd_parts = []
        if project_info.lint_commands:
            cmd_parts.append(f"lint: `{'`, `'.join(project_info.lint_commands[:3])}`")
        if project_info.format_commands:
            cmd_parts.append(f"fmt: `{'`, `'.join(project_info.format_commands[:3])}`")
        if project_info.test_commands:
            cmd_parts.append(f"test: `{'`, `'.join(project_info.test_commands[:3])}`")
        if project_info.build_commands:
            cmd_parts.append(f"build: `{'`, `'.join(project_info.build_commands[:3])}`")
        if cmd_parts:
            ctx_parts.append(" | ".join(cmd_parts))

        if project_info.conventions:
            conv = ", ".join(f"{k}={v}" for k, v in project_info.conventions.items())
            ctx_parts.append(f"conventions: {conv}")

        prompt += "\n".join(ctx_parts)

        if project_info.project_instructions:
            prompt += f"\n\n### Instructions\n{project_info.project_instructions[:4000]}"

    prompt += _TOOL_REFERENCE

    if task:
        prompt += f"\n\n## Task\n\n{task}\n"

    return prompt


def build_classification_prompt(task: str) -> str:
    return f"""\
Classify the following user request into exactly one category. Respond with only the \
category name (one word).

## Categories

- **code**: Writing/editing code, running terminal commands, installing packages, \
building/testing software, git operations, file manipulation, system administration, \
devops tasks. Does NOT need a web browser.
- **browser**: Navigating websites, filling forms, extracting web data, clicking \
buttons, web automation, online shopping, checking prices/stocks/weather, reading web \
articles, searching for current online information. Needs browser or web search access.
- **conversational**: Greetings, general questions that don't need current data, \
clarifications, "what can you do?", "how are you?", "thanks", explanations about \
capabilities.

## Rules
- If the task requires reading/writing local files → code
- If the task requires running shell commands → code
- If the task requires navigating to a URL → browser
- If the task could be done in a terminal → code
- If the task requires viewing rendered web pages → browser
- If the task requires CURRENT/REAL-TIME information (prices, stocks, weather, news) → browser
- If the task is just chatting or asking general questions → conversational
- For mixed tasks, classify by the PRIMARY action

## Examples
"install express and create a hello world server" → code
"go to hacker news and show me the top 5 posts" → browser
"what can you do?" → conversational
"run the tests in this project" → code
"compare iPhone prices on Amazon and Best Buy" → browser
"refactor the auth module to use async/await" → code
"create a PR for my changes" → code
"check the weather in Tokyo" → browser
"thanks for your help" → conversational
"optimize the database queries in user service" → code
"set up a CI/CD pipeline" → code
"extract all email addresses from this website" → browser
"add dark mode toggle to the settings page" → code
"write a Python script to process CSV files" → code
"how do I use React hooks?" → conversational
"update the API endpoint to return paginated results" → code
"configure ESLint and Prettier for the project" → code
"deploy the Docker container to production" → code
"rename getCwd to getCurrentWorkingDirectory across the project" → code
"write unit tests for the UserService class" → code
"add TypeScript types to the API responses" → code
"set up a new Next.js project with Tailwind" → code
"what's the apple stock price" → browser
"get recent stock prices" → browser
"show me current bitcoin price" → browser

Task: {task}

Category:"""
