Avoiding recreating the initial state

React saves the initial state once and ignores it on the next renders.

function TodoList() {
  const [todos, setTodos] = useState(createInitialTodos());
  // ...

Although the result of createInitialTodos() is only used for the initial render, you’re still calling this function on every render. This can be wasteful if it’s creating large arrays or performing expensive calculations.

To solve this, you may pass it as an initializer function to useState instead:

function TodoList() {
  const [todos, setTodos] = useState(createInitialTodos);
