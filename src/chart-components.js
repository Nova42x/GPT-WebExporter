import React from 'react';
import {ComposedChart,Line,Bar,Area,Scatter,XAxis,YAxis,CartesianGrid,Tooltip,Legend,PieChart,Pie,Cell} from 'recharts';
const h=React.createElement;
const palette=['var(--blue-400)','var(--purple-400)','var(--orange-400)','var(--green-400)','var(--red-400)','var(--yellow-400)'];
export function makeChartComponent(templates={},pie=false){
 const part=(key,fallback)=>templates.parts?.[key]||fallback;
 return function Chart({data=[],series=[],xAxis={},yAxis={},height=280,layout='horizontal',showDots=true,showYAxis=true,showLegend=true}){
  const ref=React.useRef(null),[width,setWidth]=React.useState(templates.chartWidth||708);
  React.useLayoutEffect(()=>{const node=ref.current,win=node.ownerDocument.defaultView;const measure=()=>{const w=node.getBoundingClientRect().width;if(w>0)setWidth(w);};measure();if(win.ResizeObserver){const observer=new win.ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();}win.addEventListener('resize',measure);return()=>win.removeEventListener('resize',measure);},[]);
  const colors=series.map((s,i)=>s.color||palette[i%palette.length]);
  const legend=()=>h('div',{className:part('chartLegend','Legend-Bh9i45 LegendNowrap-QmpIrb')},series.map((s,i)=>h('div',{key:s.dataKey,className:part('chartLegendItem','LegendItem-f077DT')},h('div',{className:part('chartLegendMarker','LegendItemMarker-ExyBVU'),style:{backgroundColor:colors[i]}}),h('span',{className:part('chartLegendLabel','LegendItemLabel-HLVaRr')},s.label||s.dataKey))));
  const tooltip=({active,payload,label})=>active&&payload?.length?h('div',{style:{background:'var(--color-surface-elevated)',color:'var(--color-text)',border:'1px solid var(--color-border)',borderRadius:8,padding:12,fontSize:12}},h('strong',null,label),payload.map((item,i)=>h('div',{key:i,style:{color:item.color}},`${item.name}: ${series.find(s=>s.dataKey===item.dataKey)?.valuePrefix||''}${item.value}${series.find(s=>s.dataKey===item.dataKey)?.valueSuffix||''}`))):null;
  const x=typeof xAxis==='string'?{dataKey:xAxis}:xAxis||{},y=yAxis||{};
  const children=pie?[h(Pie,{key:'pie',data,dataKey:series[0]?.dataKey||'value',nameKey:x.dataKey||'name',cx:'50%',cy:'45%',outerRadius:Math.max(30,Math.min(width,height)*.32),isAnimationActive:false},data.map((row,i)=>h(Cell,{key:i,fill:palette[i%palette.length]}))),h(Tooltip,{key:'tip',content:tooltip})]:[
   h(CartesianGrid,{key:'grid',vertical:false,strokeDasharray:'3 3',stroke:'var(--color-border)'}),
   h(XAxis,{key:'x',...x,tick:{fontSize:12},stroke:'var(--color-text-secondary)',tickLine:true}),
   h(YAxis,{key:'y',width:34,...y,hide:!showYAxis,tick:{fontSize:12},stroke:'var(--color-text-secondary)'}),
   h(Tooltip,{key:'tip',content:tooltip}),
   ...(showLegend?[h(Legend,{key:'legend',content:legend})]:[]),
   ...series.map((s,i)=>{const shared={key:s.dataKey,dataKey:s.dataKey,name:s.label||s.dataKey,stroke:colors[i],fill:colors[i],isAnimationActive:false,stackId:s.stack};if(s.type==='bar')return h(Bar,{...shared,radius:[3,3,0,0]});if(s.type==='area')return h(Area,{...shared,type:s.curveType||'linear',fillOpacity:.2});if(s.type==='scatter')return h(Scatter,shared);return h(Line,{...shared,type:s.curveType||'linear',strokeWidth:2,dot:showDots?{r:3,strokeWidth:1}:false,activeDot:{r:5}});})
  ];
  return h('div',{ref,className:templates.classes?.[pie?'pie-chart':'chart']?.className||'Chart-_OEzTP','data-d-component':pie?'pie-chart':'chart','data-d-y-axis':showYAxis?'visible':'hidden',style:{height,minWidth:0,width:'100%'}},h(pie?PieChart:ComposedChart,{width,height,data,layout,margin:{top:5,right:5,bottom:5,left:5},accessibilityLayer:true},children));
 };
}
