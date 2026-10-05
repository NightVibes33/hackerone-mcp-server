import { z } from "zod";
import { CUSTOMER_OPENAPI_SPEC, CUSTOMER_OPENAPI_OPERATION_COUNT } from "./customer-openapi.generated";
import { hackerOneApiRequest } from "./h1client";

type Register = (name: string, description: string, shape: Record<string,z.ZodTypeAny>, handler: (params:any)=>Promise<any>) => void;
const METHODS = ["get","post","put","patch","delete"] as const;

function deref(schema:any, seen=new Set<string>()): any {
  if (!schema) return {};
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return {};
    const next = new Set(seen); next.add(schema.$ref);
    const parts = schema.$ref.replace(/^#\//,"").split("/");
    let cur:any = CUSTOMER_OPENAPI_SPEC;
    for (const p of parts) cur = cur?.[p];
    return deref(cur || {}, next);
  }
  return schema;
}

function stableJson(value:any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function strictBase64(value:string): boolean {
  if (!value || value.length % 4 !== 0) return false;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  try { return Buffer.from(value, "base64").toString("base64") === value; }
  catch { return false; }
}

function applySharedConstraints(out:z.ZodTypeAny, s:any): z.ZodTypeAny {
  if (s.not) {
    const forbidden=zodFromSchema(s.not);
    out=out.refine((value:any)=>!forbidden.safeParse(value).success,{message:"Value matches forbidden OpenAPI schema"});
  }
  if (s.nullable) out=out.nullable();
  return out;
}

function zodFromSchema(input:any): z.ZodTypeAny {
  const s:any=deref(input);

  if (s.allOf?.length) {
    const parts=s.allOf.map((x:any)=>zodFromSchema(x));
    let out:z.ZodTypeAny=parts[0]||z.any();
    for(let i=1;i<parts.length;i++) out=z.intersection(out,parts[i]);
    return applySharedConstraints(out,s);
  }
  if (s.oneOf?.length) {
    const variants=s.oneOf.map((x:any)=>zodFromSchema(x));
    let out:z.ZodTypeAny;
    if(variants.length===1) out=variants[0];
    else {
      const union=z.union(variants as [z.ZodTypeAny,z.ZodTypeAny,...z.ZodTypeAny[]]);
      out=union.refine(
        (value:any)=>variants.filter((variant:z.ZodTypeAny)=>variant.safeParse(value).success).length===1,
        {message:"Value must match exactly one OpenAPI oneOf schema"}
      );
    }
    return applySharedConstraints(out,s);
  }
  if (s.anyOf?.length) {
    const variants=s.anyOf.map((x:any)=>zodFromSchema(x));
    const out:z.ZodTypeAny=variants.length===1?variants[0]:z.union(variants as [z.ZodTypeAny,z.ZodTypeAny,...z.ZodTypeAny[]]);
    return applySharedConstraints(out,s);
  }
  if (Array.isArray(s.enum)&&s.enum.length) {
    const literals=s.enum.map((v:any)=>z.literal(v));
    const out:z.ZodTypeAny=literals.length===1?literals[0]:z.union(literals as [any,any,...any[]]);
    return applySharedConstraints(out,s);
  }

  let out:z.ZodTypeAny;
  switch(s.type){
    case "integer":
    case "number":{
      let schema:any=s.type==="integer"?z.number().int():z.number();
      if(typeof s.minimum==="number") schema=s.exclusiveMinimum===true?schema.gt(s.minimum):schema.min(s.minimum);
      if(typeof s.maximum==="number") schema=s.exclusiveMaximum===true?schema.lt(s.maximum):schema.max(s.maximum);
      if(typeof s.exclusiveMinimum==="number") schema=schema.gt(s.exclusiveMinimum);
      if(typeof s.exclusiveMaximum==="number") schema=schema.lt(s.exclusiveMaximum);
      if(typeof s.multipleOf==="number") schema=schema.multipleOf(s.multipleOf);
      out=schema; break;
    }
    case "boolean": out=z.boolean(); break;
    case "array":{
      let schema:any=z.array(zodFromSchema(s.items||{}));
      if(typeof s.minItems==="number") schema=schema.min(s.minItems);
      if(typeof s.maxItems==="number") schema=schema.max(s.maxItems);
      if(s.uniqueItems) schema=schema.refine(
        (values:any[])=>new Set(values.map(stableJson)).size===values.length,
        {message:"Array items must be unique"}
      );
      out=schema; break;
    }
    case "object":{
      const shape:Record<string,z.ZodTypeAny>={};
      const required=new Set<string>(s.required||[]);
      for(const [k,v] of Object.entries<any>(s.properties||{})){
        if(v?.readOnly===true) continue;
        let child=zodFromSchema(v);
        if(v.description) child=child.describe(v.description);
        shape[k]=required.has(k)?child:child.optional();
      }
      let schema:any=z.object(shape);
      if(s.additionalProperties===false) schema=schema.strict();
      else if(s.additionalProperties&&typeof s.additionalProperties==="object") schema=schema.catchall(zodFromSchema(s.additionalProperties));
      else schema=schema.catchall(z.any());
      if(typeof s.minProperties==="number") schema=schema.refine(
        (value:Record<string,unknown>)=>Object.keys(value).length>=s.minProperties,
        {message:`Object must contain at least ${s.minProperties} properties`}
      );
      if(typeof s.maxProperties==="number") schema=schema.refine(
        (value:Record<string,unknown>)=>Object.keys(value).length<=s.maxProperties,
        {message:`Object must contain at most ${s.maxProperties} properties`}
      );
      out=schema; break;
    }
    case "string":{
      if(s.format==="binary"){
        out=z.object({
          file_name:z.string().min(1),
          content_type:z.string().optional(),
          base64_data:z.string().refine(strictBase64,{message:"base64_data must be canonical Base64"}).describe("Base64-encoded file bytes"),
        }).strict();
        break;
      }
      let schema:any=z.string();
      if(typeof s.minLength==="number") schema=schema.min(s.minLength);
      if(typeof s.maxLength==="number") schema=schema.max(s.maxLength);
      if(typeof s.pattern==="string") schema=schema.regex(new RegExp(s.pattern));
      switch(s.format){
        case undefined: case null: case "password": break;
        case "byte": schema=schema.base64(); break;
        case "date": schema=schema.date(); break;
        case "date-time": schema=schema.datetime({offset:true}); break;
        case "email": schema=schema.email(); break;
        case "uuid": schema=schema.uuid(); break;
        case "url": case "uri": schema=schema.url(); break;
        case "ipv4": schema=schema.ipv4(); break;
        case "ipv6": schema=schema.ipv6(); break;
        default: break; // OpenAPI permits unrecognized formats to fall back to the base type.
      }
      out=schema; break;
    }
    default: out=s.type?z.string():z.any();
  }
  return applySharedConstraints(out,s);
}

function toolName(method:string,path:string){
  const slug=path.replace(/[{}]/g,"").replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_|_$/g,"").toLowerCase();
  return `customer_${method}_${slug}`.slice(0,120);
}

function resolveParameter(p:any){
  if(!p?.$ref) return p;
  const parts=p.$ref.replace(/^#\//,"").split("/");
  let cur:any=CUSTOMER_OPENAPI_SPEC;
  for(const x of parts) cur=cur?.[x];
  return cur||p;
}

export function registerCustomerOpenApiTools(register:Register){
  let count=0;
  const usedToolNames=new Map<string,string>();
  for(const [path,item] of Object.entries<any>(CUSTOMER_OPENAPI_SPEC.paths||{})){
    for(const method of METHODS){
      const op=item?.[method]; if(!op) continue;
      count++;
      const shape:Record<string,z.ZodTypeAny>={};
      const parameters=[...(item.parameters||[]),...(op.parameters||[])].map(resolveParameter);
      for(const p of parameters){
        if(!p?.name || !["path","query"].includes(p.in)) continue;
        const parameterContent=p.content?Object.values<any>(p.content)[0]:undefined;
        let zs=zodFromSchema(p.schema||parameterContent?.schema||{type:p.type||"string"});
        if(p.description) zs=zs.describe(p.description);
        shape[p.name]=p.required?zs:zs.optional();
      }
      const bodyParam=parameters.find((p:any)=>p?.in==="body");
      const rb=op.requestBody?deref(op.requestBody):undefined;
      let bodySchema:any=bodyParam?.schema;
      let contentType="application/json";
      if(rb){
        const content=rb.content||{};
        contentType=content["application/json"]?"application/json":content["multipart/form-data"]?"multipart/form-data":Object.keys(content)[0]||contentType;
        bodySchema=content[contentType]?.schema;
      }
      if(bodySchema){
        const resolved=deref(bodySchema);
        if(resolved.type==="object" && resolved.properties){
          const req=new Set<string>(resolved.required||[]);
          for(const [k,v] of Object.entries<any>(resolved.properties)){
            let zs=zodFromSchema(v);
            if(v.description) zs=zs.describe(v.description);
            shape[k]=(rb?.required||bodyParam?.required)&&req.has(k)?zs:zs.optional();
          }
        } else {
          shape.data=(rb?.required||bodyParam?.required)?zodFromSchema(bodySchema):zodFromSchema(bodySchema).optional();
        }
      }
      const name=toolName(method,path);
      const operationKey=`${method.toUpperCase()} ${path}`;
      const existing=usedToolNames.get(name);
      if(existing) throw new Error(`Customer MCP tool-name collision: ${name} maps both ${existing} and ${operationKey}`);
      usedToolNames.set(name,operationKey);
      const successResponse = Object.entries<any>(op.responses || {}).find(([status]) => /^2\d\d$/.test(status))?.[1];
      const responseContent = successResponse?.content || {};
      const accept = Object.keys(responseContent)[0] || "application/json";
      const description=[op.summary,op.description,`${method.toUpperCase()} ${path}`].filter(Boolean).join("\n\n");
      register(name,description,shape,async(input:any)=>{
        let resolvedPath=path;
        const query:Record<string,any>={};
        for(const p of parameters){
          if(p.in==="path"){
            if(input[p.name]===undefined) throw new Error(`Missing required path parameter ${p.name}`);
            resolvedPath=resolvedPath.replace(`{${p.name}}`,encodeURIComponent(String(input[p.name])));
          } else if(p.in==="query" && input[p.name]!==undefined) query[p.name]=input[p.name];
        }
        let body:any=undefined;
        if(bodySchema){
          const rs=deref(bodySchema);
          if(rs.type==="object" && rs.properties){
            body={};
            for(const k of Object.keys(rs.properties)) if(input[k]!==undefined) body[k]=input[k];
          } else body=input.data;
        }
        // Customer OpenAPI file endpoints are represented by exact schema fields.
        // Binary string inputs are transported as documented multipart form fields.
        if(contentType.startsWith("multipart/form-data")){
          const formFields:Record<string,string>={};
          const files:any[]=[];
          for(const [k,v] of Object.entries<any>(body||{})){
            if(v && typeof v==="object" && v.base64_data){
              files.push({field_name:k,file_name:v.file_name||"upload.bin",content_type:v.content_type,base64_data:v.base64_data});
            } else if(Array.isArray(v) && v.every(x=>x?.base64_data)){
              for(const x of v) files.push({field_name:k,file_name:x.file_name||"upload.bin",content_type:x.content_type,base64_data:x.base64_data});
            } else formFields[k]=typeof v==="string"?v:JSON.stringify(v);
          }
          return hackerOneApiRequest({method:method.toUpperCase() as any,path:resolvedPath,query,multipart_files:files,form_fields:formFields,accept});
        }
        return hackerOneApiRequest({method:method.toUpperCase() as any,path:resolvedPath,query,body,accept,content_type:contentType});
      });
    }
  }
  if(count!==CUSTOMER_OPENAPI_OPERATION_COUNT) throw new Error(`Registered ${count} Customer tools but generated spec declares ${CUSTOMER_OPENAPI_OPERATION_COUNT}`);
  return count;
}
