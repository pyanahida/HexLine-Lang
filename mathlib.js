// mathlib.js - 低频修改的数学核心库

const PI_HEX = "3.243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C8";
const E_HEX = "2.B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFE";
const SQRT2_HEX = "1.6A09E667F3BCC908B2FB1366EA957D3E3ADEC17512775099DA2F590B0667322A";
const SQRT3_HEX = "1.BB67AE8584CAA73B25742D7078B83B8925D834CC53DA4798C720A6486E45A6E2";
const SQRT5_HEX = "2.3C6EF372FE94F82BE73980C0B9DB906821044ED7E744E4A3F0D8D423A1831D2A";
const PHI_HEX = "1.9E3779B97F4A7C15F39CC0605CEDC8341082276BF3A27251F86C6A11D0C18E95";
const LG2_HEX = "0.4D104D427DE7FBCC47C4ACD605BE48BC13569862A1E8F9A4C52F37935BE631E5";
const LG3_HEX = "0.7A249E593F57F4230C0D0EA08689076384571AB306DBEE15E7BBD95F29DDBD31";
const LG7_HEX = "0.D858585BC661F94B692FF8A805FDA2DA00934F293A46C9149C91FAAE2AAAFBE9";
const GAMMA_HEX = "0.93C467E37DB0C7A4D1BE3F810152CB56A1CECC3AF65CC0190C03DF34709AFFBD";

function safeMath(op, x, useDegrees, useGradians) {
    let val = x;
    let isInverse = ['arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc'].includes(op);
    
    if (!isInverse) {
        if (useDegrees) val = val * Math.PI / 180;
        else if (useGradians) val = val * Math.PI / 200;
    }

    let r = 0;
    try {
        if (op === 'lg') { if (x <= 0) throw 0; r = Math.log10(x); }
        else if (op === 'ln') { if (x <= 0) throw 0; r = Math.log(x); }
        else if (op === 'log2') { if (x <= 0) throw 0; r = Math.log2(x); }
        
        // 基础三角
        else if (op === 'sin') r = Math.sin(val);
        else if (op === 'cos') r = Math.cos(val);
        else if (op === 'tan') r = Math.tan(val);
        else if (op === 'cot') r = 1 / Math.tan(val);
        else if (op === 'sec') r = 1 / Math.cos(val);
        else if (op === 'csc') r = 1 / Math.sin(val);
        
        // 古老三角
        else if (op === 'versin') r = 1 - Math.cos(val);
        else if (op === 'coversin') r = 1 - Math.sin(val);
        else if (op === 'exsec') r = (1 / Math.cos(val)) - 1;
        else if (op === 'excsc') r = (1 / Math.sin(val)) - 1;
        else if (op === 'haversin') r = (1 - Math.cos(val)) / 2;
        
        // 双曲
        else if (op === 'sinh') r = Math.sinh(x);
        else if (op === 'cosh') r = Math.cosh(x);
        else if (op === 'tanh') r = Math.tanh(x);
        else if (op === 'coth') r = 1 / Math.tanh(x);
        else if (op === 'sech') r = 1 / Math.cosh(x);
        else if (op === 'csch') r = 1 / Math.sinh(x);
        else if (op === 'arsinh') r = Math.asinh(x);
        
        // 反三角与反双曲 (复数域截断实部)
        else if (op === 'arcsin') { r = (x >= -1 && x <= 1) ? Math.asin(x) : Math.PI/2 * Math.sign(x); }
        else if (op === 'arccos') { r = (x >= -1 && x <= 1) ? Math.acos(x) : (x > 0 ? 0 : Math.PI); }
        else if (op === 'arctan') { r = Math.atan(x); }
        else if (op === 'arccot') { r = Math.atan2(1, x); }
        else if (op === 'arcsec') { r = (x >= 1 || x <= -1) ? Math.acos(1/x) : 0; }
        else if (op === 'arccsc') { r = (x >= 1 || x <= -1) ? Math.asin(1/x) : Math.PI/2 * Math.sign(x); }
        else if (op === 'arcosh') { r = x >= 1 ? Math.acosh(x) : 0; }
        else if (op === 'artanh') { r = (x > -1 && x < 1) ? Math.atanh(x) : (x >= 1 ? Infinity : -Infinity); }
        else if (op === 'arcoth') { r = Math.abs(x) > 1 ? Math.atanh(1 / x) : Infinity * Math.sign(x); }
        else if (op === 'arsech') { r = (x > 0 && x <= 1) ? Math.acosh(1/x) : 0; }
        else if (op === 'arcsch') { r = x !== 0 ? Math.asinh(1/x) : Infinity; }
        
        // 其它
        else if (op === 'exp') r = Math.exp(x);
        else if (op === 'ten') r = Math.pow(10, x);
        else if (op === 'sqrt') { r = x >= 0 ? Math.sqrt(x) : 0; }
        else if (op === 'cbrt') { r = x >= 0 ? Math.cbrt(x) : -Math.cbrt(-x); }
        else if (op === 'square') { r = x * x; }
        else if (op === 'cube') { r = x * x * x; }
        else if (op === 'fact') {
            if (x < 0 || !Number.isInteger(x)) throw new Error('fact requires non-negative integer');
            if (x > 170) throw new Error('number too large for fact');
            r = 1;
            for(let i=2; i<=x; i++) r *= i;
        }
    } catch(e) {
        if (e instanceof Error) throw e;
        r = 0; 
    }

    if (isInverse) {
        if (useDegrees) r = r * 180 / Math.PI;
        else if (useGradians) r = r * 200 / Math.PI;
    }
    return r;
}
