/* eslint-disable */
/* Reference only: sensitivity / chronological validation. No shared-config writes. */
(function(root){'use strict';const cp=x=>JSON.parse(JSON.stringify(x));
function core(){return root.IQXEngine||(typeof require==='function'?require('./engine.js'):null);}
function sensitivity(config,registry,bars,options,grid){if(!Array.isArray(grid.values)||grid.values.length<1||grid.values.length>100)throw Error('Lưới cần 1–100 giá trị.');const base=JSON.stringify(config);const rows=grid.values.map(v=>{let c=cp(config);if(!c.indicators[grid.indicator]?.[grid.side])throw Error('Đường tham số không hợp lệ.');c.indicators[grid.indicator][grid.side].params[grid.key]=v;let out=core().run(c,registry,bars,options);return {value:v,kpis:out.kpis,snapshot:out.snapshot};});if(JSON.stringify(config)!==base)throw Error('Input mutation');return {type:'sensitivity',grid:cp(grid),rows};}
function outsideSample(config,registry,bars,options,splitDate){if(!splitDate||splitDate<=options.start||splitDate>=options.end)throw Error('Mốc chia phải ở trong kỳ.');const prev=bars.filter(b=>b.date<splitDate).at(-1)?.date;if(!prev)throw Error('Thiếu đoạn trước.');const train=core().run(cp(config),registry,bars,{...options,end:prev}),test=core().run(cp(config),registry,bars,{...options,start:splitDate});return {type:'out_of_sample_fixed_config',selection:'Không tự tối ưu trong hàm này',splitDate,train,test};}
function walkForward(config,registry,bars,options,grid,{trainBars=250,testBars=100,minTrades=1}={}){
 const indices=bars.map((b,i)=>b.date>=options.start&&b.date<=options.end?i:-1).filter(i=>i>=0),windows=[];
 if(indices.length<trainBars+testBars)throw Error('Chưa đủ dữ liệu cho một cửa sổ.');
 for(let p=trainBars;p+testBars<=indices.length;p+=testBars){const ti=indices[p-trainBars],te=indices[p-1],oi=indices[p],oe=indices[p+testBars-1];
  const sweep=sensitivity(config,registry,bars,{...options,start:bars[ti].date,end:bars[te].date},grid);
  const eligible=sweep.rows.filter(r=>r.kpis.n_trades>=minTrades).sort((a,b)=>b.kpis.net_return-a.kpis.net_return||a.value-b.value);
  if(!eligible.length){windows.push({train_start:bars[ti].date,train_end:bars[te].date,test_start:bars[oi].date,test_end:bars[oe].date,status:'no_eligible_candidate'});continue;}
  const chosen=eligible[0],c=cp(config);c.indicators[grid.indicator][grid.side].params[grid.key]=chosen.value;
  const test=core().run(c,registry,bars,{...options,start:bars[oi].date,end:bars[oe].date});
  windows.push({train_start:bars[ti].date,train_end:bars[te].date,test_start:bars[oi].date,test_end:bars[oe].date,selected:chosen.value,train_return:chosen.kpis.net_return,test_return:test.kpis.net_return,test_max_drawdown:test.kpis.max_drawdown,n_trades:test.kpis.n_trades,open_position:test.open_position,status:'tested',test_snapshot:test.snapshot});
 }
 return {type:'walk_forward_windows',policy:'non_overlapping_tests; independently_funded_windows; no_aggregate_portfolio_return',windows,base_config:cp(config)};
}

const API={sensitivity,outsideSample,walkForward};root.IQXResearch=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
