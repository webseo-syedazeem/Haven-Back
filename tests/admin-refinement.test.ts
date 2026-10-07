import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

const state = vi.hoisted(() => ({ admin: true, invalidToken: false, operations: [] as unknown[][], record: {id:'11111111-1111-4111-8111-111111111111',type:'contact_support',status:'open',message:'Test only'}, missing: false, dbError: false }));
vi.mock('../Config/RedisConnection.ts', () => ({redis: {status: 'ready', on: vi.fn()}}));
vi.mock('../Config/Dbconnection.ts', () => ({supabaseUrlValue:'https://test.invalid',supabaseAnonKeyValue:'test',supabaseAdmin: {
  from(table: string) {
    let single = false, head = false;
    const builder: Record<string, unknown> = {};
    for (const name of ['select','eq','gte','lte','or','order','range','update','maybeSingle']) builder[name] = (...args: unknown[]) => {
      state.operations.push([table,name,...args]);
      if (name === 'maybeSingle') single = true;
      if (name === 'select') head = !!(args[1] as {head?: boolean} | undefined)?.head;
      return builder;
    };
    builder.then = (resolve: (value: unknown) => unknown) => resolve(table === 'users' ? {data:{id:1,is_admin:state.admin},error:null} : {data: state.missing || head ? null : single ? state.record : [state.record],count:state.missing ? 0 : 1,error:state.dbError ? {message:'Private internal error'} : null});
    return builder;
  }
}}));
vi.mock('@supabase/supabase-js', () => ({createClient: () => ({auth:{getUser: async () => ({data:{user:state.invalidToken ? null : {id:'auth-id'}},error:state.invalidToken ? {} : null})}})}));
import AdminRoutes from '../Routes/Admin.ts';
import { AuthMiddleware } from '../Middleware/AuthMiddleware.ts';
import { AdminAuthMiddleware } from '../Middleware/AdminAuthMiddleware.ts';
import { AdminImageUploadMiddleware, createAdminImageHandler } from '../Controller/AdminImageUpload.ts';
import { parseSupportFilters } from '../Controller/AdminSupport.ts';
let server: Server, base: string, directory: string;
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(),'passage-upload-test-'));
  const app = express(); app.use(express.json());
  app.post('/upload',AuthMiddleware,AdminAuthMiddleware,AdminImageUploadMiddleware,createAdminImageHandler(directory));
  app.use('/api',AdminRoutes);
  await new Promise<void>(resolve => {server=app.listen(0,'127.0.0.1',resolve);});
  const address=server.address(); if (!address || typeof address === 'string') throw new Error('Missing server address');
  base=`http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  const target=path.resolve(directory);
  if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('passage-upload-test-')) throw new Error('Unexpected test cleanup directory');
  await rm(target,{recursive:true,force:true});
});
beforeEach(() => {state.admin=true;state.invalidToken=false;state.operations=[];state.missing=false;state.dbError=false;});
const headers={Authorization:'Bearer fixture-token'};
describe('Actual admin route protection and support contracts (database mocked)', () => {
  it('requires valid admin authentication on list, detail, status and upload', async () => {
    for (const [url,method] of [['/api/admin/support','GET'],[`/api/admin/support/${state.record.id}`,'GET'],[`/api/admin/support/${state.record.id}/status`,'PUT'],['/upload','POST']]) {
      expect((await fetch(base+url,{method})).status).toBe(401);
      state.invalidToken=true;
      expect((await fetch(base+url,{method,headers})).status).toBe(401);
      state.invalidToken=false;state.admin=false;
      expect((await fetch(base+url,{method,headers})).status).toBe(403);
      state.admin=true;
    }
  });
  it('validates filter shapes, enums, calendar dates, page limits and ranges', () => {
    for (const input of [{page:'0'},{page_size:'101'},{status:'new'},{type:'feedback'},{from:'2026-02-30'},{from:'2026-10-05',to:'2026-10-01'},{q:['a','b']},{q:'a'.repeat(201)}]) expect(() => parseSupportFilters(input)).toThrow();
    expect(parseSupportFilters({page:'2',page_size:'10',type:'contact_support'})).toMatchObject({page:2,page_size:10,type:'contact_support'});
  });
  it('applies filters, stable server pagination and exact head counts', async () => {
    const response=await fetch(base+'/api/admin/support?page=2&page_size=10&status=open&type=contact_support&from=2026-10-01&to=2026-10-06&q=rain',{headers});
    expect(response.status).toBe(200);
    const result=await response.json(); expect(result.data.pagination).toEqual({page:2,page_size:10,total:1,total_pages:1});
    expect(state.operations).toContainEqual(['support_requests','range',10,19]);
    expect(state.operations).toContainEqual(['support_requests','eq','status','open']);
    expect(state.operations).toContainEqual(['support_requests','gte','created_at','2026-10-01T00:00:00.000Z']);
    expect(state.operations.filter(operation => operation[1] === 'select' && (operation[3] as {head?: boolean})?.head)).toHaveLength(4);
    expect(state.operations.some(operation => operation[1] === 'or' && String(operation[2]).includes('message.ilike."%rain%"'))).toBe(true);
  });
  it('gets a detail and writes only existing workflow fields', async () => {
    expect((await fetch(base+`/api/admin/support/${state.record.id}`,{headers})).status).toBe(200);
    const response=await fetch(base+`/api/admin/support/${state.record.id}/status`,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({status:'resolved',message:'must not write'})});
    expect(response.status).toBe(200);
    expect(state.operations.find(operation=>operation[1]==='update')?.[2]).toEqual({status:'resolved',updated_at:expect.any(String)});
    expect((await fetch(base+'/api/admin/support/not-a-uuid',{headers})).status).toBe(400);
    state.missing=true; expect((await fetch(base+`/api/admin/support/${state.record.id}`,{headers})).status).toBe(404);
    expect((await (await fetch(base+'/api/admin/support',{headers})).json()).data.requests).toEqual([]);
    state.dbError=true; const error=await fetch(base+'/api/admin/support',{headers}); expect(error.status).toBe(500); expect(await error.text()).not.toContain('Private internal');
  });
});
async function upload(buffer: Buffer, name: string, mime: string) {
  const body=new FormData();body.append('image',new Blob([new Uint8Array(buffer)],{type:mime}),name);
  return fetch(base+'/upload',{method:'POST',headers,body});
}
describe('Real multipart upload, Sharp encoding and filesystem output', () => {
  it.each(['png','jpeg'] as const)('converts a real %s upload to detectable WebP', async format => {
    const input=await sharp({create:{width:320,height:180,channels:3,background:'#b39c78'}})[format]().toBuffer();
    const response=await upload(input,`../../passage-test.${format}`,`image/${format}`);
    expect(response.status).toBe(201);
    const result=await response.json();const filename=decodeURIComponent(new URL(result.data.url).pathname.split('/').pop()!);
    expect(filename).toMatch(/^passage-test-.*\.webp$/);
    const output=await readFile(path.join(directory,filename));const metadata=await sharp(output).metadata();
    expect(metadata).toMatchObject({format:'webp',width:320,height:180});
    console.log(`WEBP_VERIFICATION input=${format} extension=.webp detected=${metadata.format} dimensions=${metadata.width}x${metadata.height} bytes=${output.length}`);
  });
  it('rejects MIME/extension mismatch, fake images, disguised SVG and oversize files without writing files', async () => {
    const before=await readdir(directory);
    for(const [buffer,name,mime] of [[Buffer.from('not an image'),'fake.png','image/png'],[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),'fake.png','image/png'],[Buffer.from('x'),'bad.exe','image/png'],[Buffer.alloc(5*1024*1024+1),'large.png','image/png']] as const) expect((await upload(buffer,name,mime)).status).toBe(400);
    expect(await readdir(directory)).toEqual(before);
  });
});
