import { z } from "zod";
import { hackerOneApiRequest } from "./h1client";

type Register = (name:string, description:string, shape:Record<string,z.ZodTypeAny>, handler:(params:any)=>Promise<any>)=>void;
const page = {
  "page[number]": z.number().int().min(1).optional(),
  "page[size]": z.number().int().min(1).max(100).optional(),
};
const queryOf = (p:any, extra:Record<string,any>={}) => ({...extra, ...(p["page[number]"]!==undefined?{"page[number]":p["page[number]"]}:{}), ...(p["page[size]"]!==undefined?{"page[size]":p["page[size]"]}:{})});
const call = (method:any,path:string,query?:any,body?:any,multipart_files?:any[]) => hackerOneApiRequest({method,path,query,body,multipart_files});

export function registerHackerExactTools(register:Register){
  register("hacker_get_hacktivity","GET /hackers/hacktivity",{
    queryString:z.string().optional(),
    sort:z.enum(["latest_disclosable_activity_at","-latest_disclosable_activity_at","disclosed_at","-disclosed_at","total_awarded_amount","-total_awarded_amount","votes","-votes"]).optional(),
    ...page,
  },p=>call("GET","/hackers/hacktivity",queryOf(p,{...(p.queryString!==undefined?{queryString:p.queryString}:{}),...(p.sort!==undefined?{sort:p.sort}:{})})));

  register("hacker_get_reports","GET /hackers/me/reports",page,p=>call("GET","/hackers/me/reports",queryOf(p)));
  register("hacker_create_report","POST /hackers/reports",{
    data:z.object({
      type:z.literal("report"),
      attributes:z.object({
        team_handle:z.string(),
        title:z.string(),
        vulnerability_information:z.string(),
        impact:z.string(),
        severity_rating:z.enum(["none","low","medium","high","critical"]).optional(),
        weakness_id:z.number().int().optional(),
        structured_scope_id:z.number().int().optional(),
      }),
    }),
  },p=>call("POST","/hackers/reports",undefined,{data:p.data}));
  register("hacker_get_report","GET /hackers/reports/{id}",{id:z.number().int()},p=>call("GET",`/hackers/reports/${encodeURIComponent(String(p.id))}`));

  register("hacker_get_balance","GET /hackers/payments/balance",{},()=>call("GET","/hackers/payments/balance"));
  register("hacker_get_earnings","GET /hackers/payments/earnings",page,p=>call("GET","/hackers/payments/earnings",queryOf(p)));
  register("hacker_get_payouts","GET /hackers/payments/payouts",page,p=>call("GET","/hackers/payments/payouts",queryOf(p)));

  register("hacker_get_scope_exclusions","GET /hackers/programs/{handle}/scope_exclusions",{handle:z.string()},p=>call("GET",`/hackers/programs/${encodeURIComponent(p.handle)}/scope_exclusions`));
  register("hacker_get_structured_scopes","GET /hackers/programs/{handle}/structured_scopes",{
    handle:z.string(),
    "filter[id__gt]":z.number().int().optional(),
    "filter[created_at__gt]":z.string().optional(),
    "filter[updated_at__gt]":z.string().optional(),
    ...page,
  },p=>call("GET",`/hackers/programs/${encodeURIComponent(p.handle)}/structured_scopes`,queryOf(p,{
    ...(p["filter[id__gt]"]!==undefined?{"filter[id__gt]":p["filter[id__gt]"]}:{}),
    ...(p["filter[created_at__gt]"]!==undefined?{"filter[created_at__gt]":p["filter[created_at__gt]"]}:{}),
    ...(p["filter[updated_at__gt]"]!==undefined?{"filter[updated_at__gt]":p["filter[updated_at__gt]"]}:{}),
  })));
  register("hacker_get_weaknesses","GET /hackers/programs/{handle}/weaknesses",{handle:z.string(),...page},p=>call("GET",`/hackers/programs/${encodeURIComponent(p.handle)}/weaknesses`,queryOf(p)));
  register("hacker_get_programs","GET /hackers/programs",page,p=>call("GET","/hackers/programs",queryOf(p)));
  register("hacker_get_program","GET /hackers/programs/{handle}",{handle:z.string()},p=>call("GET",`/hackers/programs/${encodeURIComponent(p.handle)}`));

  register("hacker_get_report_intent_attachments","GET /hackers/report_intents/{report_intent_id}/attachments",{report_intent_id:z.number().int()},p=>call("GET",`/hackers/report_intents/${p.report_intent_id}/attachments`));
  register("hacker_upload_report_intent_attachments","POST /hackers/report_intents/{report_intent_id}/attachments",{
    report_intent_id:z.number().int(),
    "files[]":z.array(z.object({file_name:z.string().min(1),content_type:z.string().optional(),base64_data:z.string().min(1)})).min(1),
  },p=>call("POST",`/hackers/report_intents/${p.report_intent_id}/attachments`,undefined,undefined,p["files[]"].map((f:any)=>({...f,field_name:"files[]"}))));
  register("hacker_delete_report_intent_attachment","DELETE /hackers/report_intents/{report_intent_id}/attachments/{id}",{report_intent_id:z.number().int(),id:z.number().int()},p=>call("DELETE",`/hackers/report_intents/${p.report_intent_id}/attachments/${p.id}`));

  register("hacker_get_report_intents","GET /hackers/report_intents",page,p=>call("GET","/hackers/report_intents",queryOf(p)));
  register("hacker_create_report_intent","POST /hackers/report_intents",{
    data:z.object({type:z.literal("report-intent"),attributes:z.object({team_handle:z.string(),description:z.string()})}),
  },p=>call("POST","/hackers/report_intents",undefined,{data:p.data}));
  register("hacker_get_report_intent","GET /hackers/report_intents/{id}",{id:z.string()},p=>call("GET",`/hackers/report_intents/${encodeURIComponent(p.id)}`));
  register("hacker_update_report_intent","PATCH /hackers/report_intents/{id}",{
    id:z.string(),
    data:z.object({type:z.literal("report-intent"),attributes:z.object({description:z.string()})}),
  },p=>call("PATCH",`/hackers/report_intents/${encodeURIComponent(p.id)}`,undefined,{data:p.data}));
  register("hacker_delete_report_intent","DELETE /hackers/report_intents/{id}",{id:z.string()},p=>call("DELETE",`/hackers/report_intents/${encodeURIComponent(p.id)}`));
  register("hacker_submit_report_intent","POST /hackers/report_intents/{id}/submit",{id:z.string()},p=>call("POST",`/hackers/report_intents/${encodeURIComponent(p.id)}/submit`,undefined,{}));
}
