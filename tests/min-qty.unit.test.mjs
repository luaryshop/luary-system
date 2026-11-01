import {lineFromProduct,productMinQty} from '../order-calc.js';
let ok=true;const t=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n);if(!c)ok=false};
t('sem minQty = 1',productMinQty({})===1&&productMinQty({minQty:'abc'})===1&&productMinQty({minQty:0})===1);
t('minQty 12',productMinQty({minQty:'12'})===12);
const l=lineFromProduct({id:'x',sku:'A',priceWholesale:10,minQty:5},2,[]);
t('linha sobe para 5 e subtotal 50',l.qty===5&&l.minQty===5&&l.subtotal===50);
t('acima do mínimo preserva',lineFromProduct({id:'x',sku:'A',priceWholesale:10,minQty:5},9,[]).qty===9);
process.exit(ok?0:1)
