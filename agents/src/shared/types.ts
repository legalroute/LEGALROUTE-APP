export interface AgentContext {
  logger: Pick<Console, 'info' | 'error'>;
}

export interface Agent<Input, Output> {
  name: string;
  run(input: Input, context: AgentContext): Promise<Output>;
}
