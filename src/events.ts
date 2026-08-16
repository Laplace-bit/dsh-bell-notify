/** DSH 监听的（快照可推导的）Agent 生命周期事件名单，规则表与此对齐。 */
export const EVENTS = {
  /** 会话列表中出现新的顶级会话 */
  sessionStart: 'session:start',
  /** Agent 开始执行（running false -> true） */
  agentStart: 'agent:start',
  /** Agent 开始思考（当前会话 partial 首次出现 reasoning 块） */
  agentThinking: 'agent:thinking',
  /** 工具调用派发（当前会话 runningCalls 新增 callId） */
  toolStart: 'tool:start',
  /** 工具调用完成（callId 从 runningCalls 消失） */
  toolDone: 'tool:done',
  /** 命令执行开始（nodes 出现 outcome 为空的 command） */
  commandStart: 'command:start',
  /** 命令执行完成（command 节点 outcome 变为非空） */
  commandDone: 'command:done',
  /** Agent 等待用户输入（approval / plan-review / question） */
  agentWaiting: 'agent:waiting',
  /** Agent 完成当前轮次（running true -> false 且无待处理交互） */
  agentDone: 'agent:done',
  /** 等待中的交互被用户响应且 Agent 未接续运行 */
  agentIdle: 'agent:idle',
} as const

export const LISTENED_EVENTS: readonly string[] = Object.values(EVENTS)
