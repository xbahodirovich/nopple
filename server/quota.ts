import { createHash } from 'node:crypto';
/** Redis atomically enforces caps across serverless instances. */
export async function distributedQuota(ip:string):Promise<boolean | undefined>{
 const url=process.env.UPSTASH_REDIS_REST_URL,key=process.env.UPSTASH_REDIS_REST_TOKEN;
 if(!url||!key)return undefined;
 const minute=Math.floor(Date.now()/60000),day=new Date().toISOString().slice(0,10),hash=createHash('sha256').update(ip).digest('hex');
 const script="local a=tonumber(redis.call('GET',KEYS[1]) or '0'); local b=tonumber(redis.call('GET',KEYS[2]) or '0'); if a>=tonumber(ARGV[1]) or b>=tonumber(ARGV[2]) then return 0 end; redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],120); redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],172800); return 1";
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',script,'2',`mopple:ip:${hash}:${minute}`,`mopple:day:${day}`,String(process.env.AI_PER_IP_PER_MINUTE ?? 10),String(process.env.AI_DAILY_CAP ?? 500)]),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error('Quota service unavailable');
 const result=await response.json() as {result?:number;error?:string};if(result.error||result.result===undefined)throw new Error('Quota service unavailable');return result.result===1;
}
