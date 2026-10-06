<div align="center">

# JKVideo（二开自用版）

**基于原 JKVideo 项目的个人二次开发版本，仅自用**

*当前版本：0.0.5（versionCode 5）*

---

[![React Native](https://img.shields.io/badge/React_Native-0.83-61DAFB?logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-SDK_55-000020?logo=expo)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Android-lightgrey)]()

</div>

---

## 说明

本仓库是 [JKVideo](https://github.com/tiajinsha/JKVideo) 原项目的个人二开版本。

原项目已收到哔哩哔哩律师函并停止维护。本仓库为**私有仓库**，仅供个人学习研究使用，**不公开发布、不用于商业用途**。

二开内容（相对原版）：

- 导航重构：首页（直播 / 热门 / 排行榜 / 分区）、动态、我的
- 「我的」页：头像 / 昵称 / UID、扫码登录、观看历史、我的收藏、我的关注、下载管理、设置
- 关注支持选择分组；排行榜、动态页
- 全屏播放器：画面模式（适应 / 铺满 / 拉伸）、双击快进快退、左半屏调亮度 / 右半屏调音量 / 横滑调进度、锁定、分 P 切换、UP 信息 + 在线人数
- 代码审查缺陷修复（播放器、数据竞态、安全加固等 80 项）
- 安全收敛：无硬编码密钥、自更新走自有仓库、局域网分享单文件隔离

---

## 安装（Android）

前往 [Releases](../../releases/latest) 下载最新 APK（arm64），安装即用。

> 需在 Android 设置中开启「安装未知来源应用」。
> 版本号高于手机上已安装的版本时可直接覆盖安装。

---

## 技术架构

| 层 | 技术 |
|---|---|
| 框架 | React Native 0.83 + Expo SDK 55 |
| 路由 | expo-router v4（文件系统路由） |
| 状态管理 | Zustand |
| 网络请求 | Axios |
| 视频播放 | react-native-video（DASH MPD / HLS / MP4） |
| 构建 | release 正式包（JS 打进 APK，独立运行） |

---

## 已知限制

| 限制 | 原因 |
|---|---|
| 4K / 高清晰度需大会员账号登录 | B 站 API 策略限制 |
| 部分写操作需登录态 | 需要 SESSDATA / bili_jct |
| 仅 Android arm64 | 自用打包配置 |

---

## 免责声明

本项目仅供个人学习研究使用，不得用于商业用途，不得公开发布。
所有视频内容版权归原作者及哔哩哔哩所有。
本项目与哔哩哔哩官方无任何关联。

---

## License

[MIT](LICENSE)
