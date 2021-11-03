import { join } from 'path';
import { parse } from 'url';
import { promises as fsp } from 'fs';
import { createFunction, Lambda } from '@vercel/fun';
import {
  Request,
  HeadersInit,
  RequestInfo,
  RequestInit,
  Response,
  Headers,
} from 'node-fetch';
import { build } from '../src';

interface TestParams {
  fixture: string;
  fetch: (r: RequestInfo, init?: RequestInit) => Promise<Response>;
}

interface VercelResponsePayload {
  statusCode: number;
  headers: { [name: string]: string };
  encoding: 'base64';
  body: string;
}

function headersToObject(headers: Headers) {
  const h: { [name: string]: string } = {};
  for (const [name, value] of headers) {
    h[name] = value;
  }
  return h;
}

function base64Stream(body?: Buffer | NodeJS.ReadableStream) {
  if (!body) return undefined;
  if (Buffer.isBuffer(body)) {
    return body.toString('base64');
  }
  return new Promise<string>((res, rej) => {
    const buffers: Buffer[] = [];
    body.on('data', b => buffers.push(b));
    body.on('end', () => res(Buffer.concat(buffers).toString('base64')));
    body.on('error', rej);
  });
}

function withFixture<T>(
  name: string,
  t: (props: TestParams) => Promise<T>
): () => Promise<T> {
  return async () => {
    const fixture = join(__dirname, 'fixtures', name);
    const functions = new Map<string, Lambda>();

    async function fetch(r: RequestInfo, init?: RequestInit) {
      const req = new Request(r, init);
      const url = parse(req.url);
      const pathWithIndex = join(
        url.pathname!,
        url.pathname!.endsWith('/index') ? '' : 'index'
      ).substring(1);

      let status = 404;
      let headers: HeadersInit = {};
      let body: string | Buffer = 'Function not found';

      let fn = functions.get(pathWithIndex);
      if (!fn) {
        const manifest = JSON.parse(
          await fsp.readFile(
            join(fixture, '.output/functions-manifest.json'),
            'utf8'
          )
        );
        const functionManifest = manifest.pages[pathWithIndex];
        if (functionManifest) {
          const dir = join(fixture, '.output/server/pages', pathWithIndex);
          fn = await createFunction({
            Code: {
              Directory: dir,
            },
            Handler: functionManifest.handler,
            Runtime: functionManifest.runtime,
          });
          functions.set(pathWithIndex, fn);
        }
      }

      if (fn) {
        const payload: VercelResponsePayload = await fn({
          Action: 'Invoke',
          body: JSON.stringify({
            method: req.method,
            path: req.url,
            headers: headersToObject(req.headers),
            body: await base64Stream(req.body),
            encoding: 'base64',
          }),
        });
        status = payload.statusCode;
        headers = payload.headers;
        body = Buffer.from(payload.body, 'base64');
      }

      return new Response(body, {
        status,
        headers,
      });
    }

    await build({ workPath: fixture });

    try {
      return await t({ fixture, fetch });
    } finally {
      await Promise.all(Array.from(functions.values()).map(f => f.destroy()));
    }
  };
}

describe('build()', () => {
  // Longer timeout to install deps of fixtures
  jest.setTimeout(60 * 1000);

  // Basic test with no dependencies
  // Also tests `req.query`
  it(
    'should build "hello"',
    withFixture('hello', async ({ fetch }) => {
      const res = await fetch('/api/hello');
      expect(res.status).toEqual(200);
      const body = await res.text();
      expect(body).toEqual('Hello world!');

      const res2 = await fetch('/api/hello?place=SF');
      expect(res2.status).toEqual(200);
      const body2 = await res2.text();
      expect(body2).toEqual('Hello SF!');
    })
  );

  // Tests a basic dependency with root-level `package.json`
  // and an endpoint in a subdirectory with its own `package.json`
  it(
    'should build "cowsay"',
    withFixture('cowsay', async ({ fetch }) => {
      const res = await fetch('/api');
      expect(res.status).toEqual(200);
      const body = await res.text();
      expect(body).toEqual(
        ' ____________________________\n' +
          '< cow:RANDOMNESS_PLACEHOLDER >\n' +
          ' ----------------------------\n' +
          '        \\   ^__^\n' +
          '         \\  (oo)\\_______\n' +
          '            (__)\\       )\\/\\\n' +
          '                ||----w |\n' +
          '                ||     ||'
      );

      const res2 = await fetch('/api/subdirectory');
      expect(res2.status).toEqual(200);
      const body2 = await res2.text();
      expect(body2).toEqual(
        ' _____________________________\n' +
          '< yoda:RANDOMNESS_PLACEHOLDER >\n' +
          ' -----------------------------\n' +
          '      \\\n' +
          '       \\\n' +
          '          .--.\n' +
          "  \\`--._,'.::.`._.--'/\n" +
          "    .  ` __::__ '  .\n" +
          "      -:.`'..`'.:-\n" +
          "        \\ `--' /\n" +
          '          ----\n'
      );
    })
  );

  // Tests the legacy Node.js server interface where
  // `server.listen()` is explicitly called
  it(
    'should build "node-server"',
    withFixture('node-server', async ({ fetch }) => {
      const res = await fetch('/api');
      expect(await res.text()).toEqual('root');

      const res2 = await fetch('/api/subdirectory');
      expect(await res2.text()).toEqual('subdir');

      const res3 = await fetch('/api/hapi-async');
      expect(await res3.text()).toEqual('hapi-async');
    })
  );

  // Tests the importing a `.tsx` file
  it(
    'should build "tsx-resolve"',
    withFixture('tsx-resolve', async ({ fetch }) => {
      const res = await fetch('/api');
      const body = await res.text();
      expect(body).toEqual('tsx');
    })
  );

  // Tests that nft includes statically detected asset files
  it(
    'should build "assets"',
    withFixture('assets', async ({ fetch }) => {
      const res = await fetch('/api');
      const body = await res.text();
      console.log({ body });
      expect(body).toEqual('asset1,asset2');
    })
  );

  // Tests the `includeFiles` config option
  it(
    'should build "include-files"',
    withFixture('include-files', async ({ fetch }) => {
      const res = await fetch('/api');
      const body = await res.text();
      expect(body.includes('hello Vercel!')).toEqual(true);

      const res2 = await fetch('/api/include-ts-file');
      const body2 = await res2.text();
      expect(body2.includes("const foo = 'hello TS!'")).toEqual(true);

      const res3 = await fetch('/api/root');
      const body3 = await res3.text();
      expect(body3.includes('hello Root!')).toEqual(true);

      const res4 = await fetch('/api/accepts-string');
      const body4 = await res4.text();
      expect(body4.includes('hello String!')).toEqual(true);
    })
  );

  // Tests the Vercel helper properties / functions
  it(
    'should build "helpers"',
    withFixture('helpers', async ({ fetch }) => {
      const res = await fetch('/api');
      const body = await res.text();
      expect(body).toEqual('hello anonymous');

      const res2 = await fetch('/api?who=bill');
      const body2 = await res2.text();
      expect(body2).toEqual('hello bill');

      const res3 = await fetch('/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ who: 'john' }),
      });
      const body3 = await res3.text();
      expect(body3).toEqual('hello john');

      const res4 = await fetch('/api', {
        headers: { cookie: 'who=chris' },
      });
      const body4 = await res4.text();
      expect(body4).toEqual('hello chris');

      const res5 = await fetch('/api/ts');
      expect(res5.status).toEqual(404);
      const body5 = await res5.text();
      expect(body5).toEqual('not found');

      const res6 = await fetch('/api/micro-compat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ who: 'katie' }),
      });
      const body6 = await res6.text();
      expect(body6).toEqual('hello katie');

      const res7 = await fetch('/api/no-helpers');
      const body7 = await res7.text();
      expect(body7).toEqual('no');
    })
  );
});
