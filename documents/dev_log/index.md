# 插件公共目录初始化

- 任务标识：task-357552ee-7163-440b-b48a-6045e5a22c95
- 建档时间：2026-10-06T00:15:13.636358+08:00
- 参与者：zhouyann00 / Codex
- 当前阶段：真实 1.0.0 已上架；1.0.1 待审核合入，客户端最终原生回执待补齐
- 关联：ViTalk Issue #43 https://github.com/orulink-ai/ViTalk/issues/43
- 主任务档案：ViTalk 的 documents/dev_log/2026-10-05/2026-10-05_234418_zhouyann00_未关联Issue_插件市场发布流程与今日简报走查/index.md
- 授权：用户指定公共仓库 orulink-ai/vitalk-plugins，采用 GitHub PR 审核而非自建后台。

## 实际变更

校验固定版本清单并按版本生成目录。目标分支验证器检查PR数据，GitHub Pages 自动发布目录。独立CLI自动创建上架 PR。空目录不表示已有插件上线。

## TDD 与边界

目录测试先以未实现函数运行，Red：3失败、2通过；实现后5通过。发布清单测试 Red 后6通过。实际 PR、客户端安装、今日简报迁移仍需后续走查。

初始化提交只包含公共目录工具与文档，不包含主应用未提交修改。初始化不是 PR 合入，不适用两个 parent 的合入检查。后续 PR 使用 merge commit。

## 2026-10-06T00:20:31.055196+08:00｜zhouyann00 / Codex｜entry-public-bootstrap

公共仓库已创建并推送，初始化提交 c1aea0348a3e06c6706e8191e45ef10cd8ea26af。GitHub Actions 37339504638 发布成功，实际请求 https://orulink-ai.github.io/vitalk-plugins/catalog.json 返回200、空 plugins。仓库只允许 merge commit；初始提交没有 parent，属于建仓而非PR合入。

追加CLI调用契约检查：[10项通过](publisher-contract-green.txt)，包括预检查无写入、仅提交元数据、复用待审PR、推送失败不创建PR。模拟CLI测试首次因路径解码/测试装置失败，修正装置后通过，不把它记为业务TDD Red。

修正 gh pr list 的不支持 owner:head 语法，改用 head+author；临时克隆上游避免陈旧fork；同版本已有分支复用前检查内容和diff，不覆盖。尚未实际提交真实插件PR。

## 2026-10-06T00:22:27.327271+08:00｜zhouyann00 / Codex｜entry-version-validation

追加与目录一致的正式版本号要求，拒绝带前导零版本。Red：10通过、1失败；修正后11通过。目录5项仍通过。证据：[版本Red](publisher-version-red.txt)、[发布工具Green](publisher-contract-green.txt)、[目录Green](registry-green.txt)。

接下来的验收：真实独立插件Release、自动上架PR、管理员合并、客户端远程目录下载安装；今日简报必须保留原页面。

## 2026-10-06 01:27｜Codex / market_architect｜SDK0.4 兼容维护

公开 SDK 增加受授权的共享待办读写、历史变更通知、模型元数据和完整页面布局。同步可信目录验证器与发布工具 vendored SDK；保留历史版本记录不可变。

TDD：旧 SDK 不接受 tasks.read/write，新测试 Red；更新后目录6项、发布工具12项通过，SDK13项通过。宿主新能力要求0.6.11，今日简报声明该最低版本，不向旧0.6.10客户端误报兼容。真实日报Release已存在，但目录尚未合并，客户端安装验收仍待完成。

## 2026-10-06T01:24:59.031048+08:00｜zhouyann00 / Codex｜entry-sdk04-review-maintenance

配合主任务 Issue #43 更新目录与 publisher 的 vendored SDK 至 0.4.0，并刷新 package.json、lockfile 与安装依赖。旧 SDK 新权限测试 Red：publisher 11通过1失败、registry 5通过1失败；同步后 publisher 12、registry 6、registry publisher 12 项通过，空目录构建通过。增加 tasks 权限准入测试，仍拒绝任意 tasks.invoke。统一 tgz SHA256：7bb032e706a5f0b23cec25c1d14ad8e519b6bb8058628e1ef49d9aa80c253bc8，lockfile integrity 已按实际包核对。

证据：[publisher Red](publisher-sdk04-red.log)、[registry Red](registry-sdk04-red.log)、[publisher Green](publisher-sdk04-green.log)、[registry Green](registry-sdk04-green.log)、[registry publisher Green](registry-publisher-sdk04-green.log)。本次仅本地准备维护 PR，未提交/推送。目录仍没有正式插件，Release→PR→部署→原生安装仍待主任务验收；index.html 待主任务同源更新。

## 2026-10-06｜Codex / plugin_architect｜entry-review-api-safety

修复真实上架 PR 的 `pull_request_target` fork head checkout 被安全策略拒绝的问题。删除 submission checkout，仅检出事件中的可信 base SHA（不保留凭据），通过 GitHub REST API 固定提交读取新增清单。没有启用 `allow-unsafe`。本条为本地修复，尚未提交、推送或验证修复后的远程 Actions。

可信工具 `tools/review.mjs` 检查事件仓库、base/head SHA、PR open 状态、总文件数1–20；按每页10项读取完整文件列表，拒绝修改/删除/重命名/重复/非清单路径，检查新增行数上限。读取固定 head 提交的非递归 Git 树，验证每层目录和叶子 `100644` 普通 blob（拒绝符号链接、子模块、截断树）；blob最多16KB，严格base64、UTF-8和JSON，复算 Git SHA1及长度；完成后再次确认PR未变化。

只把可信 base 的 plugins 复制到全新临时目录，并写入已验证JSON，禁止覆盖历史版本。可信 `check.mjs --changes-file` 继续校验完整目录身份、固定正式Release资产、实际安装包SHA256/大小/SDK清单，不执行插件HTML、提交者脚本、测试或依赖。GitHub token仅contents/pull-requests只读，API拒绝重定向、30秒超时和2MB响应限制；token不写日志。维护workflow/工具的PR不走自动上架通道。

TDD：[Red](review-api-red.log) 是初始安全读取尚未实现及旧双checkout契约，3失败3通过；[Green](review-api-green.log) 14项通过（原目录6项、新审核工具8项）。增加历史不可覆盖、只复制基线目录和schema失败不落盘测试；[构建](review-api-build.log) 空目录通过。测试使用模拟API，无真实账户/网络/发布调用。README同步执行边界，远程PR审核与合并由主任务接续；原档案WIP保留，index.html由主任务同源更新。

安全边界：此检查证明清单结构、不可变登记与当前Release字节一致，不能证明HTML业务安全、发布者授权身份或未来Release资产不被替换；管理员仍需审查身份、权限和源码，宿主安装必须校验登记SHA256。审核通过后新push会改变head，需新run；不能把旧head的成功当成新head通过。本地 git diff 模式保留兼容，但目标workflow不调用它、不获取fork代码。API读取不执行提交者内容，只有合入后的可信目录才能发布。

最终SDK文档包刷新：主任务重新生成0.4的README.html后，以新绝对临时目录打包，包内README.md/html与源码逐字节一致，三个vendor（registry、registry/publisher、ViTalk/plugin-publisher）字节相同。SHA256 `ea12e7f3ecea08b7bb1a85a42f37d2ddab9e28c6ce71427d4f458aa82702504b`，刷新三个lockfile实际sha512 integrity；各自使用独立新cache `npm ci --ignore-scripts`，安装后HTML与源一致。目录14、两份publisher各12项通过，空目录build通过。SDK业务版本仍0.4.0且业务代码未变；已发布日报1.0.0不得覆盖，后续使用1.0.1新Release验收。本地临时包位置 `/tmp/vitalk-sdk04-final.QvimBV/vitalk-plugin-sdk-0.4.0.tgz`，可追溯制品以提交的vendor为准。


## 2026-10-06T02:00:50.737255+08:00｜market_product / Codex｜entry-product-publication-facts

独立产品评审核对本机 gh：今日简报 Release v1.0.0/v1.0.1 已存在；[目录 PR #2](https://github.com/orulink-ai/vitalk-plugins/pull/2)为 MERGED，merge commit `2e9c73a5c61edf55e6464fcf5eb4bb4b6e9f212d`；[更新 PR #4](https://github.com/orulink-ai/vitalk-plugins/pull/4)为 OPEN，validate SUCCESS。更新 README 原有「目录为空、今日简报未迁移」的过期当前状态，保留历史开发正文。

只修改本仓库 README 与档案状态；无代码改动，TDD不适用，以实际GitHub状态查询、Release清单及README链接核对替代。未提交，后续由主代理选择性文档 PR 处理。

验收边界：主代理仍在同进程原生验证安装、启停、数据保留更新与卸载，尚不能把已下载打开 iframe 当成完整链路通过。合成桥接已验证重新生成、连续复盘，真实未配置模型的原生运行只证明可理解的错误边界。真实云模型凭据/质量不是本轮 GitHub 发布闭环的门槛，但必须明确未验证，不作已成功承诺。


## 2026-10-06T02:02:55.065374+08:00｜market_product / Codex｜entry-reserved-feature-id-parity

架构复现发现公共目录接受 `vitalk.english`，而宿主 `validateRemoteCatalog` 通过 `isReservedFeatureId` 拒绝包含该ID的整个目录。核对宿主 `public/plugins/catalog.json`，当前保留ID为 `vitalk.english` 与 `vitalk.ai-conversation`。

TDD：分别新增目录 validateListing/buildCatalog 与 publisher buildListing/publicationPlan 拒绝两个ID的检查。[Red](reserved-id-red.log)：18项中4失败14通过，失败为新保留身份约束缺失。实现最小ID拒绝后，[Green](reserved-id-green.log)：目录/审核工具、公共publisher和主仓publisher共44项通过。主仓 `plugin-publisher/publish.mjs` 与测试已同步；未修改SDK通用包validator，它仍须允许受信功能包清单。

[本地目录构建](reserved-id-build.log)通过：本维护分支的本地 plugins 为空，0个版本；该输出不是远程市场为空的证据，远程1.0.0已上线事实保留。此修复未提交/未推送，可信维护PR及远程验证由主代理继续。无其他业务或Feishu改动。

## 2026-10-06 02:12 Asia/Shanghai｜Codex｜真实更新清单合入

PR #4 已检查成功并merge，合入5c42faa8b9f9d1dd32488b07e22bbe1a845f70ac两个parent已核对，Pages实际GET含1.0.1/1.0.0。下一步通过隔离原生1.0.1→1.0.2更新走查；此前1.0.0安装已验证，300秒测试进程自动结束，不能称其已完成更新。
