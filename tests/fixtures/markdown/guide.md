---
title: Markdown review guide
tags: [review, fictional]
---

# Markdown 审阅指南

**完整的阅读体验**，保留 *原始格式*，也支持 ***嵌套强调***、~~过时描述~~、`inline code` 和转义 \*星号\*。

## 数据与证据

| 项目 | 说明 | 数值 |
| :--- | :---: | ---: |
| 光照 | **需要复核** | 48 |
| 噪声 | `a\|b` | 12 |
| 实体 | &amp; &#x1F600; | 24 |

## 审阅清单

- [x] 阅读背景
  - 追溯引用
  - 检查术语
- [ ] 复核结论

3. 第一轮审阅
4. 第二轮审阅
   1. 比较修订
   2. 导出审阅包

> [!NOTE]
> 这是一份虚构文档，用于检查阅读、批注与源码定位。
>
> > 嵌套引用保留上下文。

## 链接与图片

[证据章节](#数据与证据) · [关联文档](other.md) · [参考链接][guide]

自动链接：https://example.org/review 和 <reader@example.org>。

![本地示意图](figure.svg "Fictional illustration")

![远程图示](https://example.org/remote.png)

[guide]: https://example.org/guide "Reference guide"

## 代码与公式

```js
const review = { complete: true };
if (review.complete) console.log("<ready>");
```

    indented code
    keeps **literal** markers

行内公式 $y = ax + b$，也可写为 \(x^2\)。

$$
\sum_{i=1}^{n} x_i = n\bar{x}
$$

## HTML 与脚注

<details open>
<summary>阅读补充说明</summary>
<p>支持 <mark>重点</mark>、H<sub>2</sub>O、x<sup>2</sup>、<kbd>⌘ S</kbd> 与换行<br>第二行文字。</p>
<table><thead><tr><th>维度</th><th>结果</th></tr></thead><tbody><tr><td rowspan="2">源码保真</td><td>中文 &amp; emoji 😀</td></tr><tr><td><strong>可继续批注</strong></td></tr></tbody></table>
</details>

带来源的结论[^evidence]，以及另一次引用[^evidence]。

[^evidence]: 虚构的参考说明，包含 **补充证据**。

---

## 保持原稿

普通换行
连成段落；反斜杠后强制换行。\
下一行仍属于同一段。
