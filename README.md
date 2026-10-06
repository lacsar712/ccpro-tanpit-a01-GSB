# TanPit-01 · 南冈鞣场

鞣坑场地图作业台 + 工牌台。登录后顶栏两个入口：「坑位场地图」按行列铺开坑位，点坑登记浸液酸碱度并改状态；「工牌台」专页管理工牌。

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

### 工牌

- 工牌记录：坑码、正整数牌号、姓名、挂上时刻、可空摘下时刻。
- 一口坑现行（未摘）工牌最多一张；同一牌号现行全场唯一（数据库部分唯一索引兜底，并发抢挂只留一张）。
- 挂牌姓名只能写本人；摘牌、编辑仅限管理员或本人。
- 工牌台专页：左栏按坑/状态/关键词筛选现行与历史挂牌，可新建、可编辑；右栏两步向导（选择 → 确认）完成挂上与摘下。

### 放液门槛

坑不可标「已放液」，除非同时满足：

1. 该坑挂有**现行工牌**；
2. 工牌姓名 == 当前登录人；
3. 最近一次浸液酸碱度在 **3.5～5.0**。

缺牌、姓名不符、酸碱出带都会被中文提示挡住，且不会改写任何酸碱记录。规则在 `backend/pits/rules.py`。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```
