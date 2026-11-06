# Routing fixtures

`tiny.graph.json` is a hand-drawn graph on a 0.001-degree grid at the equator, where
one grid step is about 111 m. Edge lengths are rounded up to whole metres. Drawn with
node ids, the layout is:

```
5 --road-- 3 --walkway-- 4            6 --walkway-- 7   (an island)
|        / |             |
walkway area steps      aisle
|    /     |             |
0 --walkway-- 1 --walkway-- 2
```

Places: `corner` is node 2, `top` is node 4, `island` is node 7.
