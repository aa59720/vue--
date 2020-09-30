const utils = {
	getValue(expr, vm) {
		return vm.$data[expr.trim()]; // 注意去除前后空格
	},
	setValue(expr, vm, newValue) {
		vm.$data[expr] = newValue;

	},
	model(node, value, vm) {
		console.log(node, value, vm)
		const initValue = this.getValue(value, vm);

		new Watcher(value, vm, newValue => { // 收集watcher 
			this.modelUpdater(node, newValue)
		})

		node.addEventListener("input", (e) => {
			const newValue = e.target.value;
			this.setValue(value, vm, newValue);
		})

		this.modelUpdater(node, value)
	},
	text(node, value, vm) {
		let result;
		if (value.includes('{{')) {
			// {{XXX}}
			result = value.replace(/\{\{(.+?)\}\}/g, (...args) => {
				const expr = args[1].trim();
				new Watcher(expr, vm, newValue => {
					this.textUpdataer(node, newValue)
				})
				return this.getValue(args[1], vm)
			})
		} else {
			// v-text="XX"
			result = this.getValue(value, vm)
		}
		this.textUpdataer(node, result);
	},
	on(node, value, vm, eventName) {
		const fn = vm.$options.methods[value];
		node.addEventListener(eventName, fn.bind(vm), false)
	},
	textUpdataer(node, value) {
		node.textContent = value;
	},
	modelUpdater(node, value) {
		node.value = value;

	}
}

// 一个dom节点的依赖与更新
class Watcher { // 主要收集dom依赖，那些与dom有关联  dom与数据的关系
	constructor(expr, vm, cb) {
		this.expr = expr;
		this.vm = vm;
		this.cb = cb; // 回调
		// 通过getter 对数据进行绑定，标记当前的Watcher
		this.odelValue = this.getOldValue(); // 
	}

	getOldValue() {
		Dep.target = this; // 将Watcher放在全局
		const oldValue = utils.getValue(this.expr, this.vm);
		Dep.target = null;
		return oldValue;
	}

	undate() { // 数据更新
		const newValue = utils.getValue(this.expr, this.vm);
		if (newValue !== this.oldValue) {
			this.cb(newValue)
		}
	}
}

// 一个数据多个watcher
class Dep { // 把数据进行多个watcher进行绑定
	constructor(arg) {
		this.collect = [];
	}
	addWatcher(watcher) { // 进行收集
		this.collect.push(watcher)
	}

	notif() { // 触发收集的内容 触发Watcher   undate跟新数据
		this.collect.forEach(w => w.undate())
	}
}

class Compiler {
	constructor(el, vm) {
		this.el = this.isElementNode(el) ? el : document.querySelector(el); // 是不是已被dom选择器选择的节点
		this.vm = vm;
		const fragment = this.compileFragment(this.el);
		this.compile(fragment)

		this.el.appendChild(fragment)
	}

	
	compile(fragment) {
		const childNodes = Array.from(fragment.childNodes); // 类数组转换为数组
		// #text 会有这个元素 ，其实是开发中换行
		childNodes.forEach(childNode => {
			if (this.isElementNode(childNode)) {
				// 是否是标签节点，读取属性是否有v-开头的内容
				// console.log('标签节点',childNode);

				this.compilElement(childNode);
			} else if (this.isTextNode(childNode)) {
				// 内容文本节点{{ msg }} 是否有双大括号的语法
				// console.log('文本节点',childNode);

				this.compilText(childNode);
			}
			if (childNode.childNodes && childNode.childNodes.length) {
				// 说明他有子节点需要处理
				this.compile(childNode)
			}
		})
	}

	// 节点处理
	compilElement(node) {
		// v-开头的属性
		const attributes = Array.from(node.attributes)
		attributes.forEach(attr => {
			const {
				name,
				value
			} = attr;
			// name 属性名
			// value 属性值
			// console.log('attr',name,value);
			if (this.isDirector(name)) {
				// 指令 v-model  v-text  v-bind v-on:click
				const [, directive] = name.split("-");
				const [compileKey, eventName] = directive.split(":");

				utils[compileKey](node, value, this.vm, eventName)
			} else if(this.isEventName(name)){
				// @ 方法执行
				const [, eventName] = name.split("@");
				utils["on"](node, value, this.vm, eventName);
			}
		})
	}
	
	isEventName(node) {
		return name.startsWith("@")
	}
	
	isDirector(name) { // 筛选v-后面的指令
		return name.startsWith('v-')
	}

	compilText(node) {
		const content = node.textContent;
		if (/\{\{(.+)\}\}/.test(content)) {

			utils['text'](node, content, this.vm);
		}
	}

	compileFragment(el) {

		const f = document.createDocumentFragment(); // 文档片段 改变是不会直接渲染只有在插入的时候才会渲染

		let firstChild;
		while (firstChild = el.firstChild) {
			f.appendChild(firstChild) // 如果文档树中已经存在了 newchild，它将从文档树中删除，然后重新插入它的新位置
		}

		return f
	}

	isTextNode(el) {
		return el.nodeType === 3; // 如果是3那么我们就可以认为他是 文本 节点
	}

	isElementNode(el) {
		return el.nodeType === 1; // 如果是1那么我们就可以认为他是dom选择器选择的节点
	}
	
}

class Observer { // 创建观察者
	constructor(data) {
		this.observer(data)
	}
	observer(data) {
		if (data && typeof data === 'object') {
			Object.keys(data).forEach(key => {
				this.defineReactive(data, key, data[key])
			})
		}
	}
	// 将$data里的东西进行一个深层次的处理
	// 将每一个对象都进行一个劫持
	/**
	 * @param {Object} obj  要捆绑的对象
	 * @param {Object} key  对象 的key
	 * @param {Object} value  对象的值
	 */
	defineReactive(obj, key, value) {
		this.observer(value)
		const dep = new Dep();
		Object.defineProperty(obj, key, {
			get() {
				const target = Dep.target;
				target && dep.addWatcher(target);
				return value;
			},
			set: (newVal) => { // 必须是箭头函数内部this要与外部一致
				if (newVal === value) return;
				this.observer(newVal); // 如果重新添加了对象那么重新进项一个劫持的 处理
				value = newVal;
				dep.notif(); // 通知Watcher
			}
		})
	}

}

class Vue {
	constructor(options) {
		this.$el = options.el;
		this.$data = options.data;
		this.$options = options;

		// 触发this.$data.xx 和模板的绑定  劫持get set
		new Observer(this.$data)

		//处理模板，将模板中使用的data的部分的变量和模板绑定起来, vue对象
		new Compiler(this.$el, this)


		this.proxData(this.$data)

	}
	// 操作this上的数据进行一个个的修改
	// 可以通过this.xx 更改this.$data.XX 的结果
	proxData(data) {
		Object.keys(data).forEach(key => {
			Object.defineProperty(this, key, {
				get() {
					return data[key]
				},
				set(newVal) {
					data[key] = newVal;
				}
			})
		})
	}
}
