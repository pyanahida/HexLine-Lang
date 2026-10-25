// mathlib.js - 低频修改的数学核心库

const PI_HEX = "3.243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C8";
const E_HEX = "2.B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFE";
const SQRT2_HEX = "1.6A09E667F3BCC908B2FB1366EA957D3E3ADEC17512775099DA2F590B0667322A";
const SQRT3_HEX = "1.BB67AE8584CAA73B25742D7078B83B8925D834CC53DA4798C720A6486E45A6E2";
const SQRT5_HEX = "2.3C6EF372FE94F82BE73980C0B9DB906821044ED7E744E4A3F0D8D423A1831D2A";
const PHI_HEX = "1.9E3779B97F4A7C15F39CC0605CEDC8341082276BF3A27251F86C6A11D0C18E95";
const LG2_HEX = "0.4D104D427DE7FBCC47C4ACD605BE48BC13569862A1E8F9A4C52F37935BE631E5";

// 将三角函数和反三角函数统一适配为实数域（只留实部）
function safeMath(op, x, useDegrees, useGradians) {
    let val = x;
    let isInverse = ['arcsin', 'arccos', 'arctan', 'arccot'].includes(op);
    
    // 输入角度转换
    if (!isInverse) {
        if (useDegrees) val = val * Math.PI / 180;
        else if (useGradians) val = val * Math.PI / 200;
    }

    let r = 0;
    try {
        if (op === 'lg') { if (x <= 0) throw 0; r = Math.log10(x); }
        else if (op === 'ln') { if (x <= 0) throw 0; r = Math.log(x); }
        else if (op === 'log2') { if (x <= 0) throw 0; r = Math.log2(x); }
        else if (op === 'sin') r = Math.sin(val);
        else if (op === 'cos') r = Math.cos(val);
        else if (op === 'tan') r = Math.tan(val);
        else if (op === 'cot') r = 1 / Math.tan(val); // 余切
        else if (op === 'sinh') r = Math.sinh(x);
        else if (op === 'cosh') r = Math.cosh(x);
        else if (op === 'tanh') r = Math.tanh(x);
        else if (op === 'coth') r = 1 / Math.tanh(x); // 双曲余切
        else if (op === 'arsinh') r = Math.asinh(x);
        else if (op === 'exp') r = Math.exp(x);
        else if (op === 'ten') r = Math.pow(10, x);
        
        // 开方与阶乘 (只保留实部)
        else if (op === 'sqrt') { r = x >= 0 ? Math.sqrt(x) : 0; }
        else if (op === 'cbrt') { r = x >= 0 ? Math.cbrt(x) : -Math.cbrt(-x); }
        else if (op === 'square') { r = x * x; }
        else if (op === 'cube') { r = x * x * x; }
        
        // 复数域截断实部
        else if (op === 'arcsin') { r = (x >= -1 && x <= 1) ? Math.asin(x) : Math.PI/2 * Math.sign(x); }
        else if (op === 'arccos') { r = (x >= -1 && x <= 1) ? Math.acos(x) : (x > 0 ? 0 : Math.PI); }
        else if (op === 'arctan') { r = Math.atan(x); }
        else if (op === 'arccot') { r = Math.atan2(1, x); }
        else if (op === 'arcosh') { r = x >= 1 ? Math.acosh(x) : 0; }
        else if (op === 'artanh') { r = (x > -1 && x < 1) ? Math.atanh(x) : (x >= 1 ? Infinity : -Infinity); }
        else if (op === 'arcoth') { r = Math.abs(x) > 1 ? Math.atanh(1 / x) : Infinity * Math.sign(x); }
        else if (op === 'fact') {
            if (x < 0 || !Number.isInteger(x)) throw new Error('fact requires non-negative integer');
            if (x > 170) throw new Error('number too large for fact');
            r = 1;
            for(let i=2; i<=x; i++) r *= i;
        }
    } catch(e) {
        if (e instanceof Error) throw e;
        r = 0; // 捕获 Infinity/NaN 退化为 0
    }

    // 反三角函数输出角度转换
    if (isInverse) {
        if (useDegrees) r = r * 180 / Math.PI;
        else if (useGradians) r = r * 200 / Math.PI;
    }
    return r;
}
