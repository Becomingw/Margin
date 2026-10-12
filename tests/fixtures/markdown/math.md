# 公式与表格兼容检查

## 判定示例

| 事件 | 含义 | 判定条件 | 是否纳入统计 |
| ---- | ---- | -------- | ------------ |
| Q | 缺少参考 | 参考材料不足以判定 | 否 |
| P | 暂缓判定 | 两次独立检查结果不同 | 否（另行记录） |
| C | 冲突 | 描述矛盾；或 $D_f$ 与 $R_f$ 不相交且方向相反 | 是 |

| 表达式 | 说明 |
| --- | --- |
| $P(A|B)$ | 条件概率 |
| $|x|$ | 绝对值 |
| $\|v\|$ | 向量范数 |

## 常见公式

化学：$\ce{CO2 + H2O <=> H2CO3}$。微分：$\dv{f}{x}$。

$$\begin{align}
a &= b + c \\
d &= e + f
\end{align}$$

\[
\begin{cases} x^2 & x > 0 \\ 0 & x \le 0 \end{cases}
\]

\begin{equation}
E = mc^2
\end{equation}

```math
\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}
```

## 宏和交叉引用

前向引用：$\eqref{demo}$。

$$
\newcommand{\vect}[1]{\mathbf{#1}}
\vect{x} = (1,2)\label{demo}\tag{A}
$$

后续公式也能使用同一文档的宏：$\vect{y}$。

普通代码中的 `$not_math$` 保持原样。

## 可读的错误提示

$\unsupportedCommand{x}$
