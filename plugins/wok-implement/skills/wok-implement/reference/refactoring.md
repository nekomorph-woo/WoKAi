# 重构候选

TDD 循环结束后，寻找：

- **Duplication** → 提取函数/类
- **Long methods** → 拆分为私有辅助方法（保持测试在公共接口）
- **Shallow modules** → 合并或深化
- **Feature envy** → 将逻辑移到数据所在处
- **Primitive obsession** → 引入值对象
- **Existing code** → 新代码揭示的现有代码问题
