# ViTalk 插件发布工具

借鉴 Raycast 一条命令创建上架 PR 的流程。开发者使用独立源码仓库和固定 GitHub Release；工具只往 [公共目录](https://github.com/orulink-ai/vitalk-plugins) 提交版本清单。

完整开发者及管理员步骤见 [公共目录指南](https://github.com/orulink-ai/vitalk-plugins#开发者如何上架)。当前工具在仓库提供，尚未发布到 npm。

```sh
npm ci --ignore-scripts
node cli.mjs --repository owner/repo --tag v1.0.0 --asset plugin.vitalk-plugin.json --min-host 0.6.10 --dry-run
```

去掉 `--dry-run` 才会 fork、推送元数据分支并创建 PR。使用本机 `gh auth login`，不收集开发者 token。PR 创建成功为等待审核，不等于 Store 上架。

已登记同版本不覆盖；相同待审版本复用 PR；同版本改包需升版本。临时目录删除，插件源码工作区不被提交。推送成功但 PR 创建失败时，下次检查并复用内容一致的已有分支。

测试使用合成包和模拟 gh/git，只验证 CLI 调用契约；不代表真实 GitHub 插件上架完成。
