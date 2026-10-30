import {describe,expect,it} from 'vitest';
import {buildImportFormSnapshot,remainingImportFields} from '../src/sales-import-completion';

describe('import completion snapshot',()=>{
  it('persists every pending field and derives completion from current values',()=>{
    const snapshot=buildImportFormSnapshot(['category','supplier','destination']);
    expect(snapshot.importPending).toEqual(['category','supplier','destination']);
    expect(remainingImportFields(snapshot,null,null,false)).toEqual(['category_id','supplier_id','destination_text']);
    expect(remainingImportFields(snapshot,'category','Gramado',true)).toEqual([]);
  });
  it('does not create pending requirements for complete imports',()=>{
    expect(remainingImportFields(buildImportFormSnapshot([]),null,null,false)).toEqual([]);
  });
});
