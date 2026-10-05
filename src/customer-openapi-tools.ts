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

function zodFromSchema(input:any): z.ZodTypeAny {
  let s:any = deref(input);
  if (s.allOf?.length) {
    const parts=s.allOf.map((x:any)=>zodFromSchema(x));
    let out:any=parts[0] || z.any();
    for(let i=1;i<parts.length;i++) out=z.intersection(out,parts[i]);
    return s.nullable ? out.nullable() : out;
  }
  if (s.oneOf?.length || s.anyOf?.length) {
    const variants=(s.oneOf||s.anyOf).map((x:any)=>zodFromSchema(x));
    const out:any=variants.length===1?variants[0]:z.union(variants as [z.ZodTypeAny,z.ZodTypeAny,...z.ZodTypeAny[]]);
    return s.nullable?out.nullable():out;
  }
  let out:z.ZodTypeAny;
  if (Array.isArray(s.enum) && s.enum.length) {
    const literals=s.enum.map((v:any)=>z.literal(v));
    out=literals.length===1?literals[0]:z.union(literals as [any,any,...any[]]);
  } else switch(s.type) {
    case "integer": out=z.number().int(); break;
    case "number": out=z.number(); break;
    case "boolean": out=z.boolean(); break;
    case "array": out=z.array(zodFromSchema(s.items||{})); break;
    case "object": {
      const shape:Record<string,z.ZodTypeAny>={};
      const required=new Set<string>(s.required||[]);
      for(const [k,v] of Object.entries<any>(s.properties||{})){
        let child=zodFromSchema(v);
        if(v.description) child=child.describe(v.description);
        shape[k]=required.has(k)?child:child.optional();
      }
      out=z.object(shape);
      if(s.additionalProperties && typeof s.additionalProperties==="object") out=(out as z.ZodObject<any>).catchall(zodFromSchema(s.additionalProperties));
      else if(s.additionalProperties!==false) out=(out as z.ZodObject<any>).passthrough();
      break;
    }
    case "string":
      out = s.format === "binary"
        ? z.object({
            file_name: z.string().min(1),
            content_type: z.string().optional(),
            base64_data: z.string().min(1).describe("Base64-encoded file bytes"),
          })
        : z.string();
      break;
    default: out=s.type?z.string():z.any();
  }
  if(typeof s.minimum==="number" && out instanceof z.ZodNumber) out=out.min(s.minimum);
  if(typeof s.maximum==="number" && out instanceof z.ZodNumber) out=out.max(s.maximum);
  if(typeof s.minLength==="number" && out instanceof z.ZodString) out=out.min(s.minLength);
  if(typeof s.maxLength==="number" && out instanceof z.ZodString) out=out.max(s.maxLength);
  if(typeof s.pattern==="string" && out instanceof z.ZodString) out=out.regex(new RegExp(s.pattern));
  if(typeof s.minItems==="number" && out instanceof z.ZodArray) out=out.min(s.minItems);
  if(typeof s.maxItems==="number" && out instanceof z.ZodArray) out=out.max(s.maxItems);
  if(s.nullable) out=out.nullable();
  return out;
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
  for(const [path,item] of Object.entries<any>(CUSTOMER_OPENAPI_SPEC.paths||{})){
    for(const method of METHODS){
      const op=item?.[method]; if(!op) continue;
      count++;
      const shape:Record<string,z.ZodTypeAny>={};
      const params=[...(item.parameters||[]),...(op.parameters||[])].map(resolveParameter);
      for(const p of params){
        if(!p?.name || !["path","query"].includes(p.in)) continue;
        let zs=zodFromSchema(p.schema||{type:p.type||"string"});
        if(p.description) zs=zs.describe(p.description);
        shape[p.name]=p.required?zs:zs.optional();
      }
      const bodyParam=params.find((p:any)=>p?.in==="body");
      const rb=op.requestBody;
      let bodySchema:any=bodyParam?.schema;
      let contentType="application/json";
      if(rb){
        const content=rb.content||{};
        contentType=Object.keys(content)[0]||contentType;
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
      const successResponse = Object.entries<any>(op.responses || {}).find(([status]) => /^2\d\d$/.test(status))?.[1];
      const responseContent = successResponse?.content || {};
      const accept = Object.keys(responseContent)[0] || "application/json";
      const description=[op.summary,op.description,`${method.toUpperCase()} ${path}`].filter(Boolean).join("\n\n");
      register(name,description,shape,async(params:any)=>{
        let resolvedPath=path;
        const query:Record<string,any>={};
        for(const p of params){
          if(p.in==="path"){
            if(params[p.name]===undefined) throw new Error(`Missing required path parameter ${p.name}`);
            resolvedPath=resolvedPath.replace(`{${p.name}}`,encodeURIComponent(String(params[p.name])));
          } else if(p.in==="query" && params[p.name]!==undefined) query[p.name]=params[p.name];
        }
        let body:any=undefined;
        if(bodySchema){
          const rs=deref(bodySchema);
          if(rs.type==="object" && rs.properties){
            body={};
            for(const k of Object.keys(rs.properties)) if(params[k]!==undefined) body[k]=params[k];
          } else body=params.data;
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
        return hackerOneApiRequest({method:method.toUpperCase() as any,path:resolvedPath,query,body,accept});
      });
    }
  }
  if(count!==CUSTOMER_OPENAPI_OPERATION_COUNT) throw new Error(`Registered ${count} Customer tools but generated spec declares ${CUSTOMER_OPENAPI_OPERATION_COUNT}`);
  return count;
}
