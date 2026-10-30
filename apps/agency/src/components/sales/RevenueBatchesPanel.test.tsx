import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {RevenueBatchesPanel} from './RevenueBatchesPanel';
import {api} from '../../lib/api';

vi.mock('../../lib/api',()=>({api:{get:vi.fn(),put:vi.fn(),post:vi.fn()}}));
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(path=>Promise.resolve({data:path.endsWith('settlement-policy')?
    {settlementMode:'BATCH_WINDOW',closingDay:25,paymentDays:7}:
    {batches:[{id:'b1',month:'2026-09',expected_payment_date:'2026-10-02',amount:70,count:1,received_at:null}]}}));
  vi.mocked(api.post).mockResolvedValue({data:{id:'b1'}});
  vi.mocked(api.put).mockResolvedValue({data:{}});
});
describe('RevenueBatchesPanel',()=>{
  it('saves an explicit window, closes the chosen month and receives its batch',async()=>{
    render(<RevenueBatchesPanel/>);
    expect(await screen.findByDisplayValue('25')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Salvar política de recebimento'}));
    await waitFor(()=>expect(api.put).toHaveBeenCalledWith('/agency-revenue/settlement-policy',{settlementMode:'BATCH_WINDOW',closingDay:25,paymentDays:7}));
    fireEvent.change(screen.getByLabelText('Mês da janela'),{target:{value:'2026-09'}});
    fireEvent.click(screen.getByRole('button',{name:'Fechar lote'}));
    await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/agency-revenue/batches/close',{month:'2026-09'}));
    fireEvent.change(screen.getByLabelText('Referência do recebimento do lote'),{target:{value:'Extrato 10'}});
    fireEvent.click(screen.getByRole('button',{name:'Registrar recebimento do lote 2026-09'}));
    await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/agency-revenue/batches/b1/receive',{reference:'Extrato 10'}));
  });
  it('reports a failed load and does not offer mutation',async()=>{
    vi.mocked(api.get).mockRejectedValue(new Error('Sem permissão'));
    render(<RevenueBatchesPanel/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
    expect(screen.queryByRole('button',{name:'Fechar lote'})).not.toBeInTheDocument();
  });
});
