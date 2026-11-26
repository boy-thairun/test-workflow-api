type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function validateRoomDefinition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { width, height, spawn, obstacles, catalog } = value;
  if (!isPositiveInteger(width) || !isPositiveInteger(height) || !Array.isArray(obstacles) || !Array.isArray(catalog)) {
    return false;
  }

  const cellKey = (cell: unknown) => {
    if (!isRecord(cell)) return null;
    const { x, y } = cell;
    if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0 || x >= width
      || typeof y !== 'number' || !Number.isSafeInteger(y) || y < 0 || y >= height) {
      return null;
    }
    return x + ',' + y;
  };

  const spawnKey = cellKey(spawn);
  if (spawnKey === null) return false;
  const occupied = new Set([spawnKey]);
  for (const obstacle of obstacles as unknown[]) {
    const key = cellKey(obstacle);
    if (key === null || occupied.has(key)) return false;
    occupied.add(key);
  }

  const ids = new Set<string>();
  for (const item of catalog as unknown[]) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.trim() === ''
      || !isPositiveInteger(item.width) || !isPositiveInteger(item.height)
      || item.width > width || item.height > height || ids.has(item.id)) {
      return false;
    }
    ids.add(item.id);
  }
  return true;
}
