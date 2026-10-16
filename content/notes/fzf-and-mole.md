---
title: "两个一直在用的命令行工具：fzf 和 mole"
publishDate: "2026-10-16T12:00:00+08:00"
---

推荐两个我每天都在用的命令行工具：[fzf](https://github.com/junegunn/fzf) 和 [mole](https://github.com/tw93/Mole)，一个管「找」，一个管「删」，装完之后基本离不开。

::github{repo="junegunn/fzf"}

fzf 是一个通用模糊搜索器：任何列表从管道里进来，它都能交互式过滤——历史命令（Ctrl-R）、文件路径（Ctrl-T）、git 分支、进程名。它不决定你搜什么，只负责把「在终端里翻列表」变成打几个字母的事。

```bash
Ctrl-R                                # 模糊搜索历史命令
Ctrl-T                                # 模糊补全文件路径参数
git branch | fzf                      # 任何列表都能接：管道进来交互式过滤
git checkout $(git branch | fzf)      # 模糊选个分支切过去
kill $(ps aux | fzf | awk '{print $2}')  # 模糊找进程再结束它
```

::github{repo="tw93/Mole"}

mole 是 tw93 的开源 macOS 清理工具，命令就叫 `mo`：缓存和日志、卸载应用后的残留、项目构建产物（`purge`）都能处理，还带一个交互式的磁盘空间分析。最喜欢的一点是清理前可以先预览：

```bash
mo clean --dry-run   # 先看看会删什么，再决定
mo clean
mo analyze           # 交互式分析磁盘空间都花在哪了
```

> 一个找得快，一个删得放心——终端里的两条脏活流水线就这么齐了。
