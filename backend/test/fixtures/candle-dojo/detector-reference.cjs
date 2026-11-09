// Bản gốc nguyên văn của Phụ lục A (IQX-Candle-Dojo-SPEC-v1.2.md). CHỈ dùng làm đối chứng trong test:
// detector.ts phải cho đúng kết quả của file này trên mọi chuỗi nến. Không import từ mã chạy thật.
// Bộ nhận diện 47 thẻ nến IQX Candle Dojo – định nghĩa duy nhất, dùng chung cho bài học, chấm bài và Flashback
"use strict";
const P = { MIN_R_ATR:0.5, DOJI:0.05, SMALL:0.35, LONG:0.60, SHADOW_SHORT:0.15, SHADOW_LONG:0.60, EQ_ATR:0.05,
  CTX_ATR:1.5, CTX_ZONE:0.25 };

function prep(bars){ // bars: {o,h,l,c,ref?}
  const n=bars.length, ema10=new Array(n), ema20=new Array(n), atr=new Array(n);
  let e10=bars[0].c,e20=bars[0].c,a=bars[0].h-bars[0].l;
  for(let i=0;i<n;i++){const b=bars[i];e10=i?e10+(b.c-e10)*2/11:b.c;e20=i?e20+(b.c-e20)*2/21:b.c;
    const tr=i?Math.max(b.h-b.l,Math.abs(b.h-bars[i-1].c),Math.abs(b.l-bars[i-1].c)):b.h-b.l;a=i?(a*13+tr)/14:tr;
    ema10[i]=e10;ema20[i]=e20;atr[i]=a;}
  return {bars,ema10,ema20,atr};
}
// Bối cảnh tại nến j (nến ngay trước mẫu). lo/hi = thấp nhất/cao nhất của mẫu
// Trả về: "D" (đang giảm), "T" (đang tăng), null (không rõ)
function ctx(S,j,lo,hi){
  const B=S.bars; if(j<25) return null;
  const A=S.atr[j]; let HH=-Infinity,LL=Infinity; for(let k=j-19;k<=j;k++){HH=Math.max(HH,B[k].h);LL=Math.min(LL,B[k].l)}
  const rg=HH-LL||1e-9, c=B[j].c;
  const dn=(c<S.ema10[j]&&S.ema10[j]<S.ema10[j-5])+(c<=B[j-5].c-P.CTX_ATR*A)+(lo<=LL+P.CTX_ZONE*rg);
  const up=(c>S.ema10[j]&&S.ema10[j]>S.ema10[j-5])+(c>=B[j-5].c+P.CTX_ATR*A)+(hi>=HH-P.CTX_ZONE*rg);
  const isD=dn>=2,isT=up>=2;
  if(isD&&!isT) return "D"; if(isT&&!isD) return "T"; return null;
}
// tiện ích
const R=b=>b.h-b.l, Bd=b=>Math.abs(b.c-b.o), U=b=>b.h-Math.max(b.o,b.c), D=b=>Math.min(b.o,b.c)-b.l;
const bull=b=>b.c>b.o, bear=b=>b.c<b.o, top=b=>Math.max(b.o,b.c), bot=b=>Math.min(b.o,b.c), mid=b=>(b.o+b.c)/2;
const long=(b,A)=>R(b)>0&&Bd(b)>=P.LONG*R(b)&&R(b)>=A;
const small=b=>R(b)>0&&Bd(b)<=P.SMALL*R(b);
function lim(ref){const t=ref<10000?10:ref<50000?50:100;return {tran:Math.floor(ref*1.07/t)*t,san:Math.ceil(ref*0.93/t)*t}}
const big=(S,i)=>R(S.bars[i])>=P.MIN_R_ATR*S.atr[i-1];
const hamShape=b=>R(b)>0&&Bd(b)<=P.SMALL*R(b)&&D(b)>=2*Bd(b)&&D(b)>=P.SHADOW_LONG*R(b)&&U(b)<=P.SHADOW_SHORT*R(b);
const invShape=b=>R(b)>0&&Bd(b)<=P.SMALL*R(b)&&U(b)>=2*Bd(b)&&U(b)>=P.SHADOW_LONG*R(b)&&D(b)<=P.SHADOW_SHORT*R(b);
const inside=(x,m)=>x.h<m.h&&x.l>m.l;

// Mỗi thẻ: id, tên, n (số nến; 0 = thay đổi), f(S,i) trả về true / số nến (với mẫu độ dài thay đổi)
const C1=[], C2=[], C3=[], C4=[], C5=[];
// ---------- 1 NẾN (bối cảnh xét tại i-1) ----------
function vn(S,i){const b=S.bars[i],ref=S.bars[i-1].c,{tran,san}=lim(ref);
  if(b.o===tran&&b.h===tran&&b.l===tran&&b.c===tran) return "tran_trang";
  if(b.o===san&&b.h===san&&b.l===san&&b.c===san) return "san_trang";
  if(b.c===tran&&b.o<=ref) return "keo_tran";
  if(b.c===san&&b.o>=ref) return "dap_san"; return null;}
C1.push(
 {id:"tran_trang",n:1,f:(S,i)=>vn(S,i)==="tran_trang"},
 {id:"san_trang",n:1,f:(S,i)=>vn(S,i)==="san_trang"},
 {id:"keo_tran",n:1,f:(S,i)=>vn(S,i)==="keo_tran"},
 {id:"dap_san",n:1,f:(S,i)=>vn(S,i)==="dap_san"},
 {id:"marubozu_tang",n:1,f:(S,i)=>{const b=S.bars[i];return !vn(S,i)&&bull(b)&&U(b)<=0.05*R(b)&&D(b)<=0.05*R(b)&&R(b)>=S.atr[i-1]}},
 {id:"marubozu_giam",n:1,f:(S,i)=>{const b=S.bars[i];return !vn(S,i)&&bear(b)&&U(b)<=0.05*R(b)&&D(b)<=0.05*R(b)&&R(b)>=S.atr[i-1]}},
 {id:"bua",n:1,f:(S,i)=>{const b=S.bars[i];return !vn(S,i)&&big(S,i)&&hamShape(b)&&ctx(S,i-1,b.l,b.h)==="D"}},
 {id:"treo_co",n:1,f:(S,i)=>{const b=S.bars[i];return !vn(S,i)&&big(S,i)&&hamShape(b)&&ctx(S,i-1,b.l,b.h)==="T"}},
 {id:"bua_nguoc",n:1,f:(S,i)=>{const b=S.bars[i];return !vn(S,i)&&big(S,i)&&invShape(b)&&ctx(S,i-1,b.l,b.h)==="D"}},
 {id:"sao_bang",n:1,f:(S,i)=>{const b=S.bars[i];return !vn(S,i)&&big(S,i)&&invShape(b)&&ctx(S,i-1,b.l,b.h)==="T"}},
 {id:"doji",n:1,f:(S,i)=>{const b=S.bars[i];if(vn(S,i)||!big(S,i)||!(R(b)>0&&Bd(b)<=P.DOJI*R(b)))return false;
   const cx=ctx(S,i-1,b.l,b.h);if((hamShape(b)||invShape(b))&&(cx==="D"||cx==="T"))return false;return true}},
);
// ---------- 2 NẾN (a=i-1, b=i; bối cảnh tại i-2) ----------
const two=(S,i)=>{const a=S.bars[i-1],b=S.bars[i];return {a,b,A:S.atr[i-1],cx:ctx(S,i-2,Math.min(a.l,b.l),Math.max(a.h,b.h))}};
C2.push(
 {id:"cu_da_tang",n:2,f:(S,i)=>{const {a,b,A}=two(S,i);return bear(a)&&long(a,A)&&bull(b)&&long(b,A)&&b.o>a.o+P.EQ_ATR*A&&b.l>=a.o}},
 {id:"cu_da_giam",n:2,f:(S,i)=>{const {a,b,A}=two(S,i);return bull(a)&&long(a,A)&&bear(b)&&long(b,A)&&b.o<a.o-P.EQ_ATR*A&&b.h<=a.o}},
 {id:"gap_tang",n:2,f:(S,i)=>{const {a,b,cx}=two(S,i);return cx==="T"&&bull(a)&&b.l>a.h&&bull(b)&&Bd(b)>=0.5*R(b)}},
 {id:"gap_giam",n:2,f:(S,i)=>{const {a,b,cx}=two(S,i);return cx==="D"&&bear(a)&&b.h<a.l&&bear(b)&&Bd(b)>=0.5*R(b)}},
 {id:"nhan_chim_tang",n:2,f:(S,i)=>{const {a,b,cx}=two(S,i);return cx==="D"&&bear(a)&&bull(b)&&b.o<=a.c&&b.c>=a.o&&Bd(b)>Bd(a)}},
 {id:"nhan_chim_giam",n:2,f:(S,i)=>{const {a,b,cx}=two(S,i);return cx==="T"&&bull(a)&&bear(b)&&b.o>=a.c&&b.c<=a.o&&Bd(b)>Bd(a)}},
 {id:"duong_xuyen",n:2,f:(S,i)=>{const {a,b,A,cx}=two(S,i);return cx==="D"&&bear(a)&&long(a,A)&&bull(b)&&b.o<a.c&&b.c>mid(a)&&b.c<a.o}},
 {id:"may_den",n:2,f:(S,i)=>{const {a,b,A,cx}=two(S,i);return cx==="T"&&bull(a)&&long(a,A)&&bear(b)&&b.o>a.c&&b.c<mid(a)&&b.c>a.o}},
 {id:"harami_tang",n:2,f:(S,i)=>{const {a,b,A,cx}=two(S,i);return cx==="D"&&bear(a)&&long(a,A)&&top(b)<=a.o&&bot(b)>=a.c&&Bd(b)<=0.5*Bd(a)}},
 {id:"harami_giam",n:2,f:(S,i)=>{const {a,b,A,cx}=two(S,i);return cx==="T"&&bull(a)&&long(a,A)&&top(b)<=a.c&&bot(b)>=a.o&&Bd(b)<=0.5*Bd(a)}},
 {id:"nhip_day",n:2,f:(S,i)=>{const {a,b,A,cx}=two(S,i);return cx==="D"&&bear(a)&&bull(b)&&Math.abs(a.l-b.l)<=P.EQ_ATR*A&&!excl2(S,i,"nhip_day")}},
 {id:"nhip_dinh",n:2,f:(S,i)=>{const {a,b,A,cx}=two(S,i);return cx==="T"&&bull(a)&&bear(b)&&Math.abs(a.h-b.h)<=P.EQ_ATR*A&&!excl2(S,i,"nhip_dinh")}},
 {id:"tach_roi_tang",n:2,f:(S,i)=>{const {a,b,A,cx}=two(S,i);return cx==="T"&&bear(a)&&bull(b)&&long(b,A)&&Math.abs(b.o-a.o)<=P.EQ_ATR*A}},
 {id:"tach_roi_giam",n:2,f:(S,i)=>{const {a,b,A,cx}=two(S,i);return cx==="D"&&bull(a)&&bear(b)&&long(b,A)&&Math.abs(b.o-a.o)<=P.EQ_ATR*A}},
 {id:"tren_co",n:2,f:(S,i)=>{const {a,b,A,cx}=two(S,i);return cx==="D"&&bear(a)&&long(a,A)&&bull(b)&&b.o<a.l&&Math.abs(b.c-a.l)<=P.EQ_ATR*A}},
 {id:"inside_bar",n:2,f:(S,i)=>{const {a,b}=two(S,i);return inside(b,a)&&R(a)>=S.atr[i-1]&&!C1.some(c=>c.f(S,i))&&!excl2(S,i,"inside_bar")}},
);
function excl2(S,i,self){return C2.some(c=>{if(c.id===self)return false;if(self!=="inside_bar"&&c.id==="inside_bar")return false;if(self.startsWith("nhip")&&c.id.startsWith("nhip"))return false;return c.f(S,i)})}
// ---------- 3 NẾN (a=i-2,b=i-1,c=i; bối cảnh tại i-3) ----------
const three=(S,i)=>{const a=S.bars[i-2],b=S.bars[i-1],c=S.bars[i];return {a,b,c,A:S.atr[i-2],cx:ctx(S,i-3,Math.min(a.l,b.l,c.l),Math.max(a.h,b.h,c.h))}};
const rise3=(a,b,c,A)=>[a,b,c].every(x=>bull(x)&&long(x,A))&&b.c>a.c&&c.c>b.c&&b.o>=a.o&&b.o<=a.c&&c.o>=b.o&&c.o<=b.c;
C3.push(
 {id:"sao_mai",n:3,f:(S,i)=>{const {a,b,c,A,cx}=three(S,i);return cx==="D"&&bear(a)&&long(a,A)&&small(b)&&top(b)<=a.c&&bull(c)&&c.c>=mid(a)}},
 {id:"sao_hom",n:3,f:(S,i)=>{const {a,b,c,A,cx}=three(S,i);return cx==="T"&&bull(a)&&long(a,A)&&small(b)&&bot(b)>=a.c&&bear(c)&&c.c<=mid(a)}},
 {id:"ba_linh",n:3,f:(S,i)=>{const {a,b,c,A,cx}=three(S,i);return cx==="D"&&rise3(a,b,c,A)}},
 {id:"khoi_tien",n:3,f:(S,i)=>{const {a,b,c,A,cx}=three(S,i);return cx==="T"&&[a,b,c].every(bull)&&b.c>a.c&&c.c>b.c&&b.o>=a.o&&b.o<=a.c&&c.o>=b.o&&c.o<=b.c&&Bd(c)<Bd(b)&&Bd(b)<Bd(a)&&U(c)>=0.3*R(c)}},
 {id:"ba_qua",n:3,f:(S,i)=>{const {a,b,c,A,cx}=three(S,i);return cx==="T"&&[a,b,c].every(x=>bear(x)&&long(x,A))&&b.c<a.c&&c.c<b.c&&b.o<=a.o&&b.o>=a.c&&c.o<=b.o&&c.o>=b.c}},
 {id:"hai_qua",n:3,f:(S,i)=>{const {a,b,c,A,cx}=three(S,i);return cx==="T"&&bull(a)&&long(a,A)&&bear(b)&&R(b)>0&&Bd(b)>P.SMALL*R(b)&&bot(b)>a.c&&bear(c)&&c.o<=b.o&&c.o>=b.c&&c.c>a.o&&c.c<a.c}},
 {id:"fakey_tang",n:3,f:(S,i)=>{const {a,b,c}=three(S,i);return inside(b,a)&&c.l<b.l&&bull(c)&&c.c>b.l&&c.c<=a.h&&!excl3(S,i)}},
 {id:"fakey_giam",n:3,f:(S,i)=>{const {a,b,c}=three(S,i);return inside(b,a)&&c.h>b.h&&bear(c)&&c.c<b.h&&c.c>=a.l&&!excl3(S,i)}},
);
function excl3(S,i){return C3.some(c=>!c.id.startsWith("fakey")&&c.f(S,i))}
// ---------- 4 NẾN (bối cảnh tại i-4) ----------
const four=(S,i)=>{const x=[S.bars[i-3],S.bars[i-2],S.bars[i-1],S.bars[i]];return {x,A:S.atr[i-3],cx:ctx(S,i-4,Math.min(...x.map(b=>b.l)),Math.max(...x.map(b=>b.h)))}};
const marub=(b)=>R(b)>0&&U(b)<=0.03*R(b)&&D(b)<=0.03*R(b);
C4.push(
 {id:"tan_cong_tang",n:4,f:(S,i)=>{const {x:[a,b,c,d],cx}=four(S,i);return cx==="D"&&bear(a)&&bear(b)&&bear(c)&&b.c<a.c&&c.c<b.c&&bull(d)&&d.o<=c.c&&d.c>=a.o}},
 {id:"tan_cong_giam",n:4,f:(S,i)=>{const {x:[a,b,c,d],cx}=four(S,i);return cx==="T"&&bull(a)&&bull(b)&&bull(c)&&b.c>a.c&&c.c>b.c&&bear(d)&&d.o>=c.c&&d.c<=a.o}},
 {id:"en_con",n:4,f:(S,i)=>{const {x:[a,b,c,d],cx}=four(S,i);return cx==="D"&&bear(a)&&marub(a)&&bear(b)&&marub(b)&&bear(c)&&c.o<b.c&&c.h>b.c&&bear(d)&&d.o>=c.h&&d.c<=c.l}},
);
// ---------- 5 NẾN TRỞ LÊN (f trả về số nến nếu khớp) ----------
const five=(S,i)=>{const x=[0,1,2,3,4].map(k=>S.bars[i-4+k]);return {x,A:S.atr[i-4],cx:ctx(S,i-5,Math.min(...x.map(b=>b.l)),Math.max(...x.map(b=>b.h)))}};
C5.push(
 {id:"ba_pp_tang",n:5,f:(S,i)=>{const {x:[a,b,c,d,e],A,cx}=five(S,i);return cx==="T"&&bull(a)&&long(a,A)&&[b,c,d].every(m=>Bd(m)<=0.5*Bd(a)&&m.h<=a.h&&m.l>=a.l)&&bull(e)&&long(e,A)&&e.c>a.c?5:0}},
 {id:"ba_pp_giam",n:5,f:(S,i)=>{const {x:[a,b,c,d,e],A,cx}=five(S,i);return cx==="D"&&bear(a)&&long(a,A)&&[b,c,d].every(m=>Bd(m)<=0.5*Bd(a)&&m.h<=a.h&&m.l>=a.l)&&bear(e)&&long(e,A)&&e.c<a.c?5:0}},
 {id:"but_pha_tang",n:5,f:(S,i)=>{const {x:[a,b,c,d,e],A,cx}=five(S,i);return cx==="D"&&bear(a)&&long(a,A)&&bear(b)&&b.h<a.l&&c.c<b.c&&d.c<c.c&&bull(e)&&long(e,A)&&e.c>b.h&&e.c<a.l?5:0}},
 {id:"but_pha_giam",n:5,f:(S,i)=>{const {x:[a,b,c,d,e],A,cx}=five(S,i);return cx==="T"&&bull(a)&&long(a,A)&&bull(b)&&b.l>a.h&&c.c>b.c&&d.c>c.c&&bear(e)&&long(e,A)&&e.c<b.l&&e.c>a.h?5:0}},
 {id:"day_bac_thang",n:5,f:(S,i)=>{const {x:[a,b,c,d,e],A,cx}=five(S,i);return cx==="D"&&[a,b,c].every(m=>bear(m)&&long(m,A))&&b.o<a.o&&b.c<a.c&&c.o<b.o&&c.c<b.c&&bear(d)&&U(d)>=0.5*R(d)&&bull(e)&&e.o>d.o&&e.c>d.h?5:0}},
 {id:"dao_day",n:0,f:(S,i)=>island(S,i,"D")},
 {id:"dao_dinh",n:0,f:(S,i)=>island(S,i,"T")},
 {id:"thap_day",n:0,f:(S,i)=>tower(S,i,"D")},
 {id:"thap_dinh",n:0,f:(S,i)=>tower(S,i,"T")},
);
function island(S,i,side){ // nến i mở gap ngược lại; cụm đảo k = 3..10 nến
  const B=S.bars,e=B[i];
  for(let k=3;k<=10;k++){const s=i-k,p=s-1;if(p<26)break;const isl=B.slice(s,i);
    if(side==="D"){const hi=Math.max(...isl.map(b=>b.h));if(B[p].l>hi&&e.l>hi&&ctx(S,p-1,Math.min(...isl.map(b=>b.l)),B[p].h)==="D")return k+2}
    else{const lo=Math.min(...isl.map(b=>b.l));if(B[p].h<lo&&e.h<lo&&ctx(S,p-1,B[p].l,Math.max(...isl.map(b=>b.h)))==="T")return k+2}}
  return 0;
}
function tower(S,i,side){ // nến dài, 3..8 nến thân nhỏ, nến dài ngược chiều
  const B=S.bars,e=B[i];
  for(let k=3;k<=8;k++){const s=i-k-1;if(s<26)break;const a=B[s],m=B.slice(s+1,i),A=S.atr[s];
    if(!long(a,A)||!long(e,A)||!m.every(small))continue;
    const lo=Math.min(a.l,e.l,...m.map(b=>b.l)),hi=Math.max(a.h,e.h,...m.map(b=>b.h));
    if(side==="D"&&bear(a)&&bull(e)&&m.every(b=>b.h<=a.o&&b.l>=a.c-A)&&e.c>=a.o-0.25*Bd(a)&&ctx(S,s-1,lo,hi)==="D")return k+2;
    if(side==="T"&&bull(a)&&bear(e)&&m.every(b=>b.l>=a.o&&b.h<=a.c+A)&&e.c<=a.o+0.25*Bd(a)&&ctx(S,s-1,lo,hi)==="T")return k+2;}
  return 0;
}
const ALL={1:C1,2:C2,3:C3,4:C4,5:C5};
// Trả về mọi thẻ khớp tại phiên i (không lọc) – để kiểm thử
function rawMatches(S,i){const out=[];
  if(i>=1)C1.forEach(c=>{if(c.f(S,i))out.push({id:c.id,n:1})});
  if(i>=3)C2.forEach(c=>{if(c.f(S,i))out.push({id:c.id,n:2})});
  if(i>=4)C3.forEach(c=>{if(c.f(S,i))out.push({id:c.id,n:3})});
  if(i>=5)C4.forEach(c=>{if(c.f(S,i))out.push({id:c.id,n:4})});
  if(i>=27)C5.forEach(c=>{const v=c.f(S,i);if(v)out.push({id:c.id,n:v})});
  return out;}
// Thẻ hiện ra: mẫu nhiều nến nhất
function pick(S,i){const m=rawMatches(S,i);if(!m.length)return null;m.sort((x,y)=>y.n-x.n);return m[0]}
const API={P,prep,ctx,rawMatches,pick,ALL,lim};
if(typeof module!=="undefined"&&module.exports)module.exports=API;else window.CDET=API;

