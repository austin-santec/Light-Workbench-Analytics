export type QueryColumnType = 'integer' | 'decimal' | 'float' | 'string' | 'boolean' | 'datetime' | 'date' | 'time' | 'binary' | 'other';
export type QueryCell = string | number | boolean | null;

export interface QuerySchemaObject {
  name: string;
  kind: 'table' | 'view';
  columns: string[];
}

export interface QuerySchemaConnected {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  source: 'reviewed_grant_contract';
  objects: QuerySchemaObject[];
}

export interface QueryExecuteConnected {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  executed_at_utc: string;
  elapsed_ms: number;
  columns: { name: string; type: QueryColumnType }[];
  rows: QueryCell[][];
  row_count: number;
  truncated: boolean;
  multiple_result_sets: boolean;
}

export type QuerySchemaResult = QuerySchemaConnected | { data_source: 'not_connected' };
export type QueryExecuteResult = QueryExecuteConnected | { data_source: 'not_connected' };
export type QueryConsoleErrorKind = 'rejected' | 'query_failed' | 'database' | 'unreachable' | 'invalid_response' | 'request_failed';

export class QueryConsoleError extends Error {
  constructor(
    public readonly kind: QueryConsoleErrorKind,
    public readonly detail?: { code?: string; reason?: string; sqlErrorNumber?: number | null; message?: string },
  ) {
    super(kind);
    this.name = 'QueryConsoleError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNotConnected(value: unknown): value is { data_source: 'not_connected' } {
  return isRecord(value) && hasExactKeys(value, ['data_source']) && value.data_source === 'not_connected';
}

function isTls(value: unknown): value is QuerySchemaConnected['tls'] {
  return value === 'verified' || value === 'encrypted_unverified';
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isQueryCell(value: unknown): value is QueryCell {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

function isColumnType(value: unknown): value is QueryColumnType {
  return ['integer', 'decimal', 'float', 'string', 'boolean', 'datetime', 'date', 'time', 'binary', 'other'].includes(String(value));
}

function isSchemaObject(value: unknown): value is QuerySchemaObject {
  return isRecord(value)
    && hasExactKeys(value, ['name', 'kind', 'columns'])
    && typeof value.name === 'string'
    && value.name.length > 0
    && (value.kind === 'table' || value.kind === 'view')
    && Array.isArray(value.columns)
    && value.columns.every(column => typeof column === 'string' && column.length > 0);
}

function isSchemaConnected(value: unknown): value is QuerySchemaConnected {
  return isRecord(value)
    && hasExactKeys(value, ['data_source', 'tls', 'source', 'objects'])
    && value.data_source === 'test_database'
    && isTls(value.tls)
    && value.source === 'reviewed_grant_contract'
    && Array.isArray(value.objects)
    && value.objects.length > 0
    && value.objects.every(isSchemaObject);
}

function isExecuteConnected(value: unknown): value is QueryExecuteConnected {
  if (!isRecord(value) || !hasExactKeys(value, ['data_source', 'tls', 'executed_at_utc', 'elapsed_ms', 'columns', 'rows', 'row_count', 'truncated', 'multiple_result_sets'])) return false;
  if (value.data_source !== 'test_database' || !isTls(value.tls) || typeof value.executed_at_utc !== 'string' || !Number.isFinite(Date.parse(value.executed_at_utc))) return false;
  if (!isNonnegativeInteger(value.elapsed_ms) || !isNonnegativeInteger(value.row_count) || typeof value.truncated !== 'boolean' || typeof value.multiple_result_sets !== 'boolean') return false;
  const columns = value.columns;
  if (!Array.isArray(columns) || !columns.every(column => isRecord(column) && hasExactKeys(column, ['name', 'type']) && typeof column.name === 'string' && isColumnType(column.type))) return false;
  return Array.isArray(value.rows)
    && value.rows.length === value.row_count
    && value.rows.every(row => Array.isArray(row) && row.length === columns.length && row.every(isQueryCell));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new QueryConsoleError('invalid_response');
  }
}

export async function loadQuerySchema(signal: AbortSignal): Promise<QuerySchemaResult> {
  let response: Response;
  try {
    response = await fetch('/api/v1/query/schema', { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new QueryConsoleError('unreachable');
  }
  if (!response.ok) throw new QueryConsoleError(response.status >= 500 ? 'unreachable' : 'request_failed');
  const body = await readJson(response);
  if (isNotConnected(body)) return body;
  if (!isSchemaConnected(body)) throw new QueryConsoleError('invalid_response');
  return body;
}

export async function executeQuery(sql: string, signal: AbortSignal): Promise<QueryExecuteResult> {
  let response: Response;
  try {
    response = await fetch('/api/v1/query/execute', {
      method: 'POST',
      signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new QueryConsoleError('unreachable');
  }
  const body = await readJson(response);
  if (response.status === 400 && isRecord(body) && hasExactKeys(body, ['code', 'reason']) && body.code === 'statement_rejected' && typeof body.reason === 'string') {
    throw new QueryConsoleError('rejected', { reason: body.reason });
  }
  if (response.status === 422 && isRecord(body) && hasExactKeys(body, ['code', 'sql_error_number', 'message']) && body.code === 'query_failed' && (body.sql_error_number === null || Number.isInteger(body.sql_error_number)) && typeof body.message === 'string') {
    throw new QueryConsoleError('query_failed', { sqlErrorNumber: body.sql_error_number as number | null, message: body.message });
  }
  if (response.status === 503 && isRecord(body) && hasExactKeys(body, ['code']) && typeof body.code === 'string') {
    throw new QueryConsoleError('database', { code: body.code });
  }
  if (!response.ok) throw new QueryConsoleError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isNotConnected(body)) return body;
  if (!isExecuteConnected(body)) throw new QueryConsoleError('invalid_response');
  return body;
}
