// 双时态工具函数
//
// 核心概念：
//   valid_time       — 事实在现实世界中何时成立
//   transaction_time — 系统何时得知/写入该事实
//
// 每条记录有 [valid_from, valid_to) 区间，valid_to 为 null 表示当前有效。

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export function isValidIso(value) {
  return ISO_DATE.test(String(value || ""));
}

export function nowIso() {
  return new Date().toISOString();
}

// 判断某条记录在 asOf 时刻是否有效（asOf 为 null 表示"当前"）
export function isCurrentlyValid(row, asOf = null) {
  if (!row) return false;
  const validFrom = row.valid_from || row.validFrom;
  const validTo = row.valid_to ?? row.validTo;
  if (!validFrom) return false;
  const point = asOf || nowIso();
  if (validFrom > point) return false;
  if (validTo != null && validTo <= point) return false;
  return true;
}

// 两个时间区间是否重叠
export function intervalsOverlap(a, b) {
  const aStart = a.valid_from || a.validFrom || "";
  const aEnd = a.valid_to ?? a.validTo;
  const bStart = b.valid_from || b.validFrom || "";
  const bEnd = b.valid_to ?? b.validTo;
  if (aEnd != null && bStart && aEnd <= bStart) return false;
  if (bEnd != null && aStart && bEnd <= aStart) return false;
  return true;
}

// 构造双时态字段的标准对象
export function makeBitemporal({ validFrom, validTo = null, now = null } = {}) {
  const txTime = now || nowIso();
  return { valid_from: validFrom || txTime, valid_to: validTo, transaction_time: txTime };
}

// 用新值替代旧记录：关闭旧 valid_to，返回新旧参数
export function supersede(existing, newValue, { validFrom } = {}) {
  const start = validFrom || nowIso();
  return {
    patchOld: { valid_to: start },
    newEvent: { valid_from: start, ...newValue },
  };
}

// ISO 时间之间的天数差
export function daysBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

// 时间衰减因子（半衰期模型，默认半衰期 90 天）
export function recencyFactor(days, halfLifeDays = 90) {
  if (days <= 0) return 1;
  return Math.exp(-days / halfLifeDays);
}

// 来源可信度权重
const SOURCE_WEIGHTS = {
  user_explicit: 1.0,
  user_statement: 0.95,
  conversation: 0.85,
  tool_result: 0.8,
  agent: 0.7,
  agent_inference: 0.7,
  system: 0.9,
  import: 0.6,
};

export function sourceWeight(source) {
  return SOURCE_WEIGHTS[String(source || "").toLowerCase()] ?? 0.5;
}
