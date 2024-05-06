<!--
 * @Author: liuluhua 718050012@qq.com
 * @Date: 2024-04-23 16:49:57
 * @LastEditors: liuluhua 718050012@qq.com
 * @LastEditTime: 2024-04-30 10:46:34
 * @FilePath: \liuluhua.github.io\README.md
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
# 基于Obsidian的笔记=Github=Blog三端同步方案

实现相关功能分为以下两步实现：
1. 利用Obsidian本地记录笔记，笔记源文件上传至GitHub，图片上传至GitHub图床
2. Github内容同步至Hexo
# 存储库创建

要实现以上两个步骤，需要三个GitHub存储库
* 用于存储图片库，用于做图床
* 用于存储笔记源文件
* 用于发布博客页面
## 图床存储库

## 源文件存储库

## 页面存储库




# Obsidian安装及插件配置

## Git同步插件配置
Git同步插件
设置Git同步，编辑gitignore（忽略包含secret部分，否则无法push），github同步后，所有笔记内容同步至GitHub
```sh
# to exclude Obsidian's settings (including plugin and hotkey configurations)
.obsidian/

# to only exclude plugin configuration. Might be useful to prevent some plugin from exposing sensitive data
.obsidian/plugins
 
# OR only to exclude workspace cache
.obsidian/workspace.json
 
# to exclude workspace cache specific to mobile devices
.obsidian/workspace-mobile.json
  
# Add below lines to exclude OS settings and caches
.trash/
.DS_Store
```




## GitHub图床插件配置
 直接配置github图床

## PicGo软件
picGo进行上传控制
### 安装
设置GitHub图床参数
![image.png](https://raw.githubusercontent.com/liuluhua/GitHubImageBed/main/PicGo/2024/05/06/20240506092308.png)

### 插件配置
启用picGo插件配置文件路径(关闭时间戳重命名)
![image.png](https://raw.githubusercontent.com/liuluhua/GitHubImageBed/main/PicGo/2024/05/06/20240506092308-1.png)








# GitHub内容如何同步至Hexo

用于发布页面
liuluhua.github.io