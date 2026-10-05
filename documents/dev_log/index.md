# 插件公共目录初始化

- 任务标识：task-357552ee-7163-440b-b48a-6045e5a22c95
- 建档时间：2026-10-06T00:15:13.636358+08:00
- 参与者：zhouyann00 / Codex
- 当前阶段：待远程验证
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
