# TanPit-01 · 南冈鞣场

鞣坑场地图作业台 + 工牌台。顶栏两个入口：「坑位场地图」点坑登记浸液酸碱度并改状态；「工牌台」专页挂牌、摘牌、管牌。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Django 5 · Django Ninja（不是 DRF 视图集） |
| 结构 | Django app `pits`：models / rules / api 分文件 |
| 数据 | Django ORM · PostgreSQL 15 |
| 前端 | Lit 3 Web Component · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4770
- API：http://localhost:8770
- PostgreSQL：localhost:6170

## 演示账号

`admin` / `123456`，`worker` / `123456`

## 业务规则

- 工牌记下坑码、正整数牌号、姓名、挂上时刻、可空摘下时刻；一口坑现行未摘最多一张（数据库部分唯一约束兜底，两人同时抢挂同坑只留一张）。
- 挂牌人姓名只能写成自己（服务端强制取当前登录人）；摘牌与改牌号仅管理员或本人。
- 坑不可标「已放液」，除非：坑上挂有现行工牌、工牌姓名等于当前登录人、且最近一次浸液酸碱度在 **3.5～5.0**。缺牌、姓名不符、酸碱出带都用中文拦住，且被挡时酸碱读数不会被改写。规则在 `backend/pits/rules.py`。
- 工牌台专页：左栏按坑筛现行挂牌，列表可筛（按坑、现行/已摘）、可新建、可编辑牌号；右栏两步向导（① 选择 → ② 确认）完成挂上与摘下。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```
