# 密钥与 API Key 保护规范

本规范是仓库的安全基线。它覆盖本地开发、CI、部署和运行时日志，不允许把密钥保护寄托在“提交前记得检查”上。

## 不可违反的规则

1. 真实 API Key、密码、Token、私钥和连接串不得进入 Git 历史、Issue、PR、截图或日志。
2. 前端构建产物是公开的。任何 `VITE_*` 变量都只能放公开配置，不能放 Secret。
3. Provider 凭据只允许由后端的 Model Supply / Provider Gateway 使用，前端只能调用本平台 API。
4. Public Trace、错误响应、监控事件和任务 Artifact 不得包含 `Authorization`、API Key、Credential、System Prompt 或原始 Provider 响应中的敏感字段。
5. 每个环境使用独立凭据，遵循最小权限、最短有效期和可撤销原则。

## 文件与变量约定

| 内容                                     | 允许提交 | 说明                                    |
| ---------------------------------------- | -------- | --------------------------------------- |
| `.env`、`.env.local`、`deploy/.env`      | 否       | 本地文件，已被 `.gitignore` 忽略        |
| `.env.example`、`deploy/.env.example`    | 是       | 只能包含空值、说明或安全占位符          |
| `VITE_*`                                 | 是       | 只放公开配置，例如 API 基地址或功能开关 |
| `*_API_KEY`、`*_SECRET`、`*_TOKEN`、密码 | 否       | 通过运行环境注入                        |
| `*.pem`、`*.key`、`credentials*.json`    | 否       | 私钥、服务账号和凭据文件                |

根目录的 `.env.example` 是跨应用变量清单。复制到本地后填写：

```powershell
Copy-Item .env.example .env
```

不要把 `.env` 加入 `git add`。提交前运行：

```text
pnpm security:scan:staged
```

## 密钥来源与运行时边界

### 本地开发

- 使用 `.env` 或操作系统用户级环境变量。
- 使用 `pnpm security:generate-secret` 生成 `JWT_SECRET`、`SESSION_SECRET` 等随机值。
- 不要在终端历史、聊天窗口或代码注释中粘贴真实 Provider Key。
- Compose 的 PostgreSQL、Redis 账号密码必须显式提供，服务只绑定 `127.0.0.1`。

### CI

- GitHub Actions 只使用 Repository/Environment Secrets 或 OIDC 换取短期云凭据。
- 禁止把 Secret 写入 workflow 日志、缓存、构建 Artifact 或测试快照。
- CI 首先执行 `pnpm security:scan`；扫描失败时不得绕过或改成只报 warning。
- 在 GitHub 仓库 Settings → Code security 中启用 Secret scanning 与 Push protection，并保持 Dependabot alerts 开启。

### 生产部署

- 使用云厂商 Secret Manager、KMS 或 GitHub Environment Secrets 注入凭据。
- 生产环境不使用 `.env` 文件随代码发布，也不把 Secret 写入 Docker image 或 Compose 文件。
- Provider Key、对象存储凭据、数据库密码和 JWT 密钥分开管理、分开轮换。
- 生产凭据应限制来源 IP、权限、额度和有效期；能使用临时凭据时不使用长期 Access Key。

## 日志、错误与可观测性

记录事件时只保留：Provider 名称、模型逻辑名、耗时、状态、请求 ID 和费用摘要。以下字段必须在进入日志前删除或掩码：

```text
authorization
api-key / api_key
access-token / refresh-token
password
secret
credential
private-key
raw provider request / response
```

掩码只能降低误报，不能替代不记录。禁止用完整 URL、请求头或异常对象直接打印 Provider 请求。

## 轮换与泄露处置

一旦怀疑泄露，按以下顺序处理：

1. 立即在 Provider、云平台或 GitHub 撤销/冻结旧凭据。
2. 创建新凭据并以最小权限替换运行环境 Secret。
3. 检查审计日志、调用额度、任务记录和异常登录。
4. 从工作区、PR、Issue、日志和 Artifact 中移除泄露内容；必要时清理 Git 历史。
5. 在安全记录中登记影响范围、轮换时间、受影响环境和回滚结果。
6. 增加一个回归测试或扫描规则，防止同类泄露再次进入仓库。

不要因为删除了文件或做了一个后续提交，就认为旧凭据已经安全；Git 历史中的值仍然视为已泄露。

## 仓库检查命令

```text
pnpm security:scan          # 扫描已跟踪和未被忽略的文件
pnpm security:scan:staged   # 扫描当前暂存区，建议提交前执行
pnpm security:generate-secret
pnpm verify                 # 包含安全扫描、类型检查、测试和构建
```

仓库扫描器只报告高置信度凭据特征和非空 Secret 赋值，不代表完整的 DLP 或供应商安全审计。GitHub Secret scanning、Provider 审计日志和人工复核仍然是必要防线。
