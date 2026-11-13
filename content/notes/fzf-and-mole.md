---
title: "两个一直在用的命令行工具：fzf 和 mole"
publishDate: "2026-10-16T12:00:00+08:00"
description: "日常高频使用的 macOS 命令行工具 fzf 与 mole：一个管交互式模糊搜索，一个管磁盘清理。"
---

推荐两个我每天都在用的命令行工具：[fzf](https://github.com/junegunn/fzf) 和 [mole](https://github.com/tw93/Mole)，一个管「找」，一个管「删」，装完之后基本离不开。

::github{repo="junegunn/fzf"}

fzf 是一个通用模糊搜索器：任何列表从管道里进来，它都能交互式过滤——历史命令（Ctrl-R）、文件路径（Ctrl-T）、git 分支、进程名。它不决定你搜什么，只负责把「在终端里翻列表」变成打几个字母的事。

启用 fzf 的 shell 集成后，按 `Ctrl-R` 搜索历史命令，按 `Ctrl-T` 把选中的文件路径插入当前命令。管道也能提供候选项：

```bash
git branch --format='%(refname:short)' | fzf  # Filter local branches
branch=$(git branch --format='%(refname:short)' | fzf)
[ -z "$branch" ] || git switch "$branch"      # Skip switch when selection is canceled
# Skip kill when process selection is canceled
pid=$(ps -e -o pid= -o comm= | fzf | awk '{print $1}')
[ -z "$pid" ] || kill "$pid"
```

::github{repo="tw93/Mole"}

mole 是 tw93 的开源 macOS 清理工具，命令就叫 `mo`：缓存和日志、卸载应用后的残留、项目构建产物（`purge`）都能处理，还带一个交互式的磁盘空间分析。最喜欢的一点是清理前可以先预览：

```bash
mo clean --dry-run   # Preview cleanup candidates without deleting them
```

`mo clean` 会永久删除文件，而不是把文件移到废纸篓；默认还会清空 `~/.Trash`。若要保留废纸篓内容，先运行 `mo clean --whitelist` 并选中 Trash。预览并核对要删除的内容后，再执行清理[^mole-clean]：

```bash
mo clean             # Permanently delete selected cleanup items
```

只想查看空间分布，可以打开交互式分析：

```bash
mo analyze           # Interactively inspect disk space usage
```

[^mole-clean]: [Mole README：Safety 与 Clean](https://github.com/tw93/Mole#safety)——`clean` 的永久删除语义，以及默认清空 `~/.Trash` 与通过白名单保留的设置。
