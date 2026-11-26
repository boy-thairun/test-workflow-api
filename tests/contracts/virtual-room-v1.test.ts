import { existsSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const contracts = new URL('../../packages/contracts/', import.meta.url);
const openApiId = 'https://virtual-room.test/contracts/openapi.v1.json';

function readContract<T>(name: string, requirement: string): T {
  const file = new URL(name, contracts);
  expect(existsSync(file), requirement + ': publish ' + name).toBe(true);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function restValidator(pointer: string) {
  const api = readContract<object>(
    'openapi.v1.json',
    'REST v1 must describe the request and response payloads',
  );
  const ajv = new Ajv2020({ strict: false });
  ajv.addSchema(api, openApiId);
  const validate = ajv.getSchema(openApiId + '#/paths/' + pointer);
  expect(validate, 'OpenAPI must define a JSON schema at ' + pointer).toBeTypeOf('function');
  return validate!;
}

function socketValidator() {
  const schema = readContract<object>(
    'websocket.v1.schema.json',
    'WebSocket v1 must describe the room message types',
  );
  return new Ajv2020({ strict: false }).compile(schema);
}

const jsonSchema = '/content/application~1json/schema';
const loginRequest = '~1auth~1login/post/requestBody' + jsonSchema;
const loginResponse = '~1auth~1login/post/responses/200' + jsonSchema;
const user = { id: 'user-1', email: 'player@example.test', displayName: 'ผู้เล่น', role: 'user' };

describe('RED-1: publish and validate virtual-room v1 fixtures', () => {
  const restCases = [
    ['loginRequest', loginRequest],
    ['loginSuccess', loginResponse],
    ['invalidCredentials', '~1auth~1login/post/responses/401' + jsonSchema],
    ['expiredSession', '~1auth~1me/get/responses/401' + jsonSchema],
    ['emptyLayout', '~1rooms~1public~1layout/get/responses/200' + jsonSchema],
    ['saveLayoutRequest', '~1rooms~1public~1layout/put/requestBody' + jsonSchema],
    ['savedLayout', '~1rooms~1public~1layout/put/responses/200' + jsonSchema],
    ['staleLayout', '~1rooms~1public~1layout/put/responses/409' + jsonSchema],
    ['invalidPlacement', '~1rooms~1public~1layout/put/responses/422' + jsonSchema],
    ['userPage', '~1admin~1users/get/responses/200' + jsonSchema],
    ['renameRequest', '~1admin~1users~1{userId}/patch/requestBody' + jsonSchema],
    ['renamedUser', '~1admin~1users~1{userId}/patch/responses/200' + jsonSchema],
    ['forbiddenRename', '~1admin~1users~1{userId}/patch/responses/403' + jsonSchema],
  ] as const;

  it('accepts the published REST fixtures for the documented operations', () => {
    const fixtures = readContract<Record<string, unknown>>(
      'fixtures/rest.v1.json',
      'REST v1 consumers need shared request and response examples',
    );
    for (const [name, pointer] of restCases) {
      const validate = restValidator(pointer);
      expect(fixtures, 'REST v1 fixtures must include ' + name).toHaveProperty(name);
      expect(validate(fixtures[name]), name + ': ' + JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it('accepts the published welcome, input, players and layout.updated messages', () => {
    const fixtures = readContract<Record<string, { type: string }>>(
      'fixtures/websocket.v1.json',
      'WebSocket v1 consumers need shared examples for each message type',
    );
    const validate = socketValidator();
    for (const type of ['welcome', 'input', 'players', 'layout.updated']) {
      expect(fixtures[type]?.type, 'WebSocket fixture discriminator').toBe(type);
      expect(validate(fixtures[type]), type + ': ' + JSON.stringify(validate.errors)).toBe(true);
    }
  });
});

describe('RED-2: reject messages outside the v1 contract', () => {
  it('requires a password in login requests', () => {
    const validate = restValidator(loginRequest);
    expect(validate({ email: user.email, password: 'example-password' })).toBe(true);
    expect(validate({ email: user.email })).toBe(false);
  });

  it('rejects account roles other than user and admin', () => {
    const validate = restValidator(loginResponse);
    expect(validate({ user })).toBe(true);
    expect(validate({ user: { ...user, role: 'admin' } })).toBe(true);
    expect(validate({ user: { ...user, role: 'moderator' } })).toBe(false);
  });

  it('requires movement directions and rejects absolute coordinates', () => {
    const validate = socketValidator();
    expect(validate({ type: 'input', seq: 1, dx: 1, dy: 0 })).toBe(true);
    expect(validate({ type: 'input', seq: 1, x: 4, y: 2 })).toBe(false);
    expect(validate({ type: 'input', seq: 1, dx: 2, dy: 0 })).toBe(false);
    expect(validate({ type: 'input', seq: 1, dx: 1 })).toBe(false);
  });
});

type RoomDefinition = {
  width: number;
  height: number;
  spawn: { x: number; y: number };
  catalog: Array<{ id: string; width: number; height: number }>;
};

async function roomValidator() {
  const file = new URL('validate-room-definition.ts', contracts);
  expect(existsSync(file), 'Room v1 must expose a validator for grid and catalog invariants').toBe(true);
  const contract: { validateRoomDefinition: (value: unknown) => boolean } = await import(file.href);
  return contract.validateRoomDefinition;
}

describe('RED-3: validate room definition invariants', () => {
  const room: RoomDefinition & { obstacles: Array<{ x: number; y: number }> } = {
    width: 6,
    height: 5,
    spawn: { x: 0, y: 0 },
    obstacles: [{ x: 2, y: 2 }],
    catalog: [{ id: 'chair', width: 1, height: 1 }],
  };

  it('accepts the published room definition', async () => {
    const definition = readContract<unknown>('room-definition.v1.json', 'Room consumers need a shared map');
    expect((await roomValidator())(definition)).toBe(true);
  });

  it('rejects a spawn on or beyond the east edge', async () => {
    const validate = await roomValidator();
    expect(validate(room)).toBe(true);
    expect(validate({ ...room, spawn: { x: room.width, y: 0 } })).toBe(false);
  });

  it('rejects catalog entries that share an ID even when sizes differ', async () => {
    const validate = await roomValidator();
    expect(validate(room)).toBe(true);
    expect(validate({ ...room, catalog: [...room.catalog, { id: 'chair', width: 2, height: 1 }] })).toBe(false);
  });
});
