import type {FormSnapshot} from './sale-form-fields';

type ImportPendingField = 'category'|'supplier'|'destination';

export function buildImportFormSnapshot(pending: readonly ImportPendingField[]): FormSnapshot {
  return {
    categoryId:'',categoryName:'Importação histórica',formRevision:0,capturedAt:new Date().toISOString(),
    importPending:[...pending],
    // Destination remains editable through the existing typed form endpoint.
    fields:[['destination_text','Destino'],['origin_text','Origem'],['travel_start_date','Embarque'],['travel_end_date','Retorno'],['passenger_count','Passageiros']].map(([fieldKey,label])=>({fieldKey:fieldKey!,label:label!,enabled:true,required:false})),
  };
}

/** Requirements are historical, their missing state is always derived from the live sale. */
export function remainingImportFields(snapshot:FormSnapshot|null,categoryId:string|null,destination:string|null,hasSupplier:boolean|undefined):string[] {
  return (snapshot?.importPending??[]).flatMap(field=>{
    if(field==='category'&&!categoryId) return ['category_id'];
    if(field==='destination'&&!destination?.trim()) return ['destination_text'];
    if(field==='supplier'&&hasSupplier===false) return ['supplier_id'];
    return [];
  });
}
