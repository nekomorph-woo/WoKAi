# 好测试与坏测试

## 好测试

**集成风格**：通过真实接口测试，而非内部 mock。

```typescript
// 好：测试可观察行为
test("用户可用有效购物车结账", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

特征：

- 测试用户/调用者关心的行为
- 仅使用公共 API
- 经受内部重构
- 描述做什么，而非怎么做
- 每个测试一个逻辑断言

## 坏测试

**实现细节测试**：与内部结构耦合。

```typescript
// 坏：测试实现细节
test("结账调用 paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

危险信号：

- Mock 内部协作者
- 测试私有方法
- 断言调用次数/顺序
- 行为未变的重构导致测试失败
- 测试名描述怎么做而非做什么
- 通过外部手段而非接口验证

```typescript
// 坏：绕过接口验证
test("createUser 保存到数据库", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// 好：通过接口验证
test("createUser 使创建的用户可被检索", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

## 系统边界 vs 内部协作者

| 类型 | 示例 | 是否 mock |
|------|------|-----------|
| 系统边界 | Repository、PaymentGateway、EmailService | ✅ 可以 mock |
| 内部协作者 | PriceCalculator、DiscountApplier | ❌ 跑真实逻辑 |

**原因**：测试目的是验证业务行为是否正确。mock 内部计算，等于跳过了要验证的逻辑。
