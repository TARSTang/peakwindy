# 第三方内容与权利边界

- 本项目通过 Windy 官方插件 SDK 在 Windy 页面中读取 Windy 点预报与地形接口。Windy、其标识、服务内容和天气数据不属于本项目许可的授权范围，使用时应遵守 Windy 当前适用条款及其数据提供方的要求。
- 本项目原创代码按 [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) 授权。该许可不授权一般商业用途；[WINDY-LICENSE-EXCEPTION.md](WINDY-LICENSE-EXCEPTION.md) 另对 Windyty, SE 作出仅用于 Windy.com 私有插件审核、托管、修改和分发的有限许可。Windy 是否接受这项安排尚待其书面确认。
- 构建工具及运行时依赖由 `package.json` 和 `package-lock.json` 管理。每项第三方依赖仍按其各自许可证授权；使用者应查看对应 npm 包随附的许可证文件。本仓库没有复制或再发布 Windy 天气数据文件。
- 插件仅在 Windy 内展示当前用户请求得到的预报；诊断复制功能不包含天气数值。不要将 Windy 账号凭据、API 密钥或原始天气数据提交到代码仓库或通过仓库分发。
- 项目不使用 Windy 商标或标识来宣称官方背书。Windy 插件配置、名称和界面中的必要来源说明仅用于标明插件运行平台和数据来源。
