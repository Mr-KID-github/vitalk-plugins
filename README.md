# ViTalk Plugin Registry

ViTalk 公共插件目录。插件源码在开发者自己的独立 GitHub 仓库，安装包在该仓库的固定版本 Release。本仓库只接收版本清单，GitHub PR 是审核入口，GitHub Actions 校验并发布静态目录，不需要自建审核服务器。

## 开发者如何上架

1. 使用 ViTalk 公开 SDK 开发，在本机导入插件包测试。保留独立源码仓库。
2. 构建 `vitalk-plugin/v1` JSON 包，将版本 `1.0.0` 对应包放在正式 `v1.0.0` GitHub Release。不得使用 latest、草稿、预发布或覆盖已登记版本。
3. 安装 Node.js 22 和 GitHub CLI，用 `gh auth login` 登录具有源码仓库写权限的账号。
4. 克隆本目录仓库，运行 `npm --prefix publisher ci --ignore-scripts`。
5. 执行以下命令。工具下载实际资产、检查 SDK 清单、计算 SHA256，然后自动 fork 目录仓库，在临时目录提交一个版本 JSON 并创建 PR。它不会提交你的源码工作区。加 `--dry-run` 可只检查和查看计划。

```sh
node /你的目录/vitalk-plugins/publisher/cli.mjs \
  --repository 你的账号/你的插件仓库 \
  --tag v1.0.0 \
  --asset 你的插件.vitalk-plugin.json \
  --min-host 0.6.11
```

可把命令写入独立插件项目的 `package.json` 的 `scripts.publish`，之后运行 `npm run publish`。当前提供仓库内工具，尚未发布到 npm。

目录校验器与 publisher 使用 vendored SDK 0.4.0，支持 `tasks.read/tasks.write` 等新公开权限；协议版本仍为 `sdkVersion:1`。需要今日简报的历史元信息、共享事项订阅和全页布局时，最低宿主版本为 0.6.11。不要把 SDK npm 版本当作客户端兼容版本。

6. PR 检查通过后，由管理员检查插件功能、权限必要性、源码及包内容。合并后生成 `catalog.json`，客户端接入这个目录后可搜索和下载安装。PR 创建成功仅表示待审核。
7. 修复或升级发布新 Release 版本，再执行同一命令。相同字节的待审版本重复执行复用原 PR；同版本变化会拒绝覆盖，需要升版本。

目录地址：[catalog.json](https://orulink-ai.github.io/vitalk-plugins/catalog.json)。目录发布成功不代表当前所有 ViTalk 客户端已接入该地址。

## 管理员审核

- 版本清单是 `plugins/<id>/<version>.json`，同版本只能新增一次。不得修改历史文件。
- 检查发布者是否为源码仓库所有者或授权协作者。CLI 的源码仓库写权限检查便于诚实开发者；审核不能仅凭清单自报 publisher 判断身份。
- 同一插件后续版本固定 publisher/repository；仓库转移、撤下或索引政策调整由管理员单独维护，不走自动上架通道。
- 自动检查只证明结构、兼容声明与安装包字节一致；不证明插件业务逻辑安全，也不替代人工权限审查。
- 合入使用 `gh pr merge --merge`，检查最终 commit 的 parent 数为 2。禁止 squash/rebase 合入。

## 自动检查的执行边界

`pull_request_target` 使用目标分支中已经审核的 workflow、验证器和 SDK；PR 内容只作为数据检出。不会安装 PR 的依赖，不执行 PR 的测试、脚本或插件 HTML。token 只有 contents:read，checkout 不保留凭据。不允许在此 workflow 中添加执行 submission 代码的步骤。

只允许新增版本清单的 PR 走此检查；维护 workflow/验证器的 PR 需要管理员单独审阅，其上架检查会按设计拒绝。主分支 push 生成静态目录并部署 GitHub Pages。

## 本地检查

```sh
npm ci --ignore-scripts
npm test
npm run build
npm --prefix publisher test
```

当前目录初始化为空。今日简报尚未以保留原界面的真实插件完成迁移；不得以示例包冒充原产品验收。

参考 [Raycast 发布流程](https://developers.raycast.com/basics/publish-an-extension)：借鉴一条命令创建 PR 的体验；ViTalk 仍采用独立插件仓库，公共仓库只保存目录。
