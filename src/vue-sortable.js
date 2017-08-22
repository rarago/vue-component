!(function(name, context, definition) {
	'use strict';
	if (typeof define === 'function' && define.amd) {
		define(['Vue', 'Sortable', 'VueUtil'], definition);
	} else {
		context[name] = definition(context['Vue'], context['Sortable'], context['VueUtil']);
		delete context[name];
	}
}
)('VueSortable', this, function(Vue, Sortable, VueUtil) {
	'use strict';
	var computeVmIndex = function(vnodes, element) {
		if (vnodes) {
			return vnodes.map(function(elt) {
				return elt.elm;
			}).indexOf(element)
		} else {
			return -1;
		}
	}
	var computeIndexes = function(slots, children) {
		if (!slots) {
			return [];
		}
		var elmFromNodes = slots.map(function(elt) {
			return elt.elm;
		});
		var rawIndexes = [].concat(VueUtil.component.toConsumableArray(children)).map(function(elt) {
				return elmFromNodes.indexOf(elt);
		});
		return rawIndexes.filter(function(index){
			return index !== -1;
		});
	}
	var emit = function(evtName, evtData) {
		var self = this;
		self.$nextTick(function() {
			self.$emit(evtName.toLowerCase(), evtData);
		});
	}
	var delegateAndEmit = function(evtName) {
		var self = this;
		return function(evtData) {
			if (self.realList !== null) {
				self['onDrag' + evtName](evtData);
			}
			emit.call(self, evtName, evtData);
		}
	}
	var eventsListened = ['Start', 'Add', 'Remove', 'Update', 'End'];
	var eventsToEmit = ['Choose', 'Sort', 'Filter', 'Clone'];
	var readonlyProperties = ['Move'].concat(eventsListened, eventsToEmit).map(function(evt) {
		return 'on' + evt;
	});
	var draggingElement = null;
	var VueSortable = {
		name: 'VueSortable',
		props: {
			options: Object,
			value: {
				type: Array,
				default: null
			},
			clone: {
				type: Function,
				default: function(original) {
					return original;
				}
			},
			element: {
				type: String,
				default: 'div'
			},
			move: {
				type: Function,
				default: null
			}
		},
		data: function() {
			return {
				componentMode: false
			};
		},
		render: function(createElement) {
			return createElement(this.element, null, this.$slots.default);
		},
		mounted: function() {
			var self = this;
			self.componentMode = self.element.toLowerCase() !== self.$el.nodeName.toLowerCase();
			var optionsAdded = {};
			eventsListened.forEach(function(elt) {
				optionsAdded['on' + elt] = delegateAndEmit.call(self, elt);
			});
			eventsToEmit.forEach(function(elt) {
				optionsAdded['on' + elt] = emit.bind(self, elt);
			});
			var options = VueUtil.merge({}, self.options, optionsAdded, {
				onMove: function(evt, originalEvent) {
					return self.onDragMove(evt, originalEvent);
				}
			});
			!('draggable'in options) && (options.draggable = '>*');
			self._sortable = new Sortable(self.rootContainer,options);
			self.computeIndexes();
		},
		beforeDestroy: function() {
			this._sortable.destroy();
		},
		computed: {
			rootContainer: function() {
				return this.$el;
			},
			isCloning: function() {
				return !!this.options && !!this.options.group && this.options.group.pull === 'clone';
			},
			realList: function() {
				return this.value;
			}
		},
		watch: {
			options: {
				handler: function(newOptionValue) {
					for (var property in newOptionValue) {
						if (readonlyProperties.indexOf(property) === -1) {
							this._sortable.option(property, newOptionValue[property]);
						}
					}
				},
				deep: true
			},
			realList: function() {
				this.computeIndexes();
			}
		},
		methods: {
			getChildrenNodes: function() {
				if (this.componentMode) {
					return this.$children[0].$slots.default;
				}
				return this.$slots.default;
			},
			computeIndexes: function() {
				var self = this;
				self.$nextTick(function() {
					self.visibleIndexes = computeIndexes(self.getChildrenNodes(), self.rootContainer.children);
				});
			},
			getUnderlyingVm: function(htmlElt) {
				var index = computeVmIndex(this.getChildrenNodes(), htmlElt);
				if (index === -1)
					return null;
				var element = this.realList[index];
				return {
					index: index,
					element: element
				};
			},
			getUnderlyingPotencialDraggableComponent: function(ref) {
				return ref.__vue__;
			},
			emitChanges: function(evt) {
				var self = this;
				self.$nextTick(function() {
					self.$emit('change', evt);
				});
			},
			alterList: function(onList) {
				var newList = [].concat(VueUtil.component.toConsumableArray(this.value));
				onList(newList);
				this.$emit('input', newList);
			},
			spliceList: function() {
				var _arguments = arguments;
				var spliceList = function(list) {
					return list.splice.apply(list, _arguments);
				};
				this.alterList(spliceList);
			},
			updatePosition: function(oldIndex, newIndex) {
				var updatePosition = function(list) {
					return list.splice(newIndex, 0, list.splice(oldIndex, 1)[0]);
				};
				this.alterList(updatePosition);
			},
			getRelatedContextFromMoveEvent: function(ref) {
				var to = ref.to
				var related = ref.related;
				var component = this.getUnderlyingPotencialDraggableComponent(to);
				if (!component) {
					return {
						component: component
					};
				}
				var list = component.realList;
				var context = {
					list: list,
					component: component
				};
				if (to !== related && list && component.getUnderlyingVm) {
					var destination = component.getUnderlyingVm(related);
					if (destination) {
						return VueUtil.merge(destination, context);
					}
				}
				return context;
			},
			getVmIndex: function(domIndex) {
				var indexes = this.visibleIndexes;
				var numberIndexes = indexes.length;
				return (domIndex > numberIndexes - 1) ? numberIndexes : indexes[domIndex]
			},
			getComponent: function() {
				return this.$slots.default[0].componentInstance;
			},
			onDragStart: function(evt) {
				this.context = this.getUnderlyingVm(evt.item);
				evt.item._underlying_vm_ = this.clone(this.context.element);
				draggingElement = evt.item;
			},
			onDragAdd: function(evt) {
				var element = evt.item._underlying_vm_;
				if (element === undefined) {
					return;
				}
				VueUtil.removeNode(evt.item);
				var newIndex = this.getVmIndex(evt.newIndex);
				this.spliceList(newIndex, 0, element);
				this.computeIndexes();
				var added = {
					element: element,
					newIndex: newIndex
				};
				this.emitChanges({
					added: added
				});
			},
			onDragRemove: function(evt) {
				VueUtil.insertNodeAt(this.rootContainer, evt.item, evt.oldIndex);
				if (this.isCloning) {
					VueUtil.removeNode(evt.clone);
					return;
				}
				var oldIndex = this.context.index;
				this.spliceList(oldIndex, 1);
				var removed = {
					element: this.context.element,
					oldIndex: oldIndex
				};
				this.emitChanges({
					removed: removed
				});
			},
			onDragUpdate: function(evt) {
				var oldIndex = this.context.index;
				var newIndex = this.getVmIndex(evt.newIndex);
				VueUtil.removeNode(evt.item);
				VueUtil.insertNodeAt(evt.from, evt.item, evt.oldIndex);
				this.updatePosition(oldIndex, newIndex);
				var moved = {
					element: this.context.element,
					oldIndex: oldIndex,
					newIndex: newIndex
				};
				this.emitChanges({
					moved: moved
				});
			},
			computeFutureIndex: function(relatedContext, evt) {
				if (!relatedContext.element) {
					return 0;
				}
				var domChildren = [].concat(VueUtil.component.toConsumableArray(evt.to.children)).filter(function(el) {
					return el.style['display'] !== 'none';
				});
				var currentDOMIndex = domChildren.indexOf(evt.related);
				var currentIndex = relatedContext.component.getVmIndex(currentDOMIndex);
				var draggedInList = domChildren.indexOf(draggingElement) != -1;
				return (draggedInList || !evt.willInsertAfter) ? currentIndex : currentIndex + 1
			},
			onDragMove: function(evt) {
				var onMove = this.move;
				if (!onMove || !this.realList) {
					return true;
				}
				var relatedContext = this.getRelatedContextFromMoveEvent(evt);
				var draggedContext = this.context;
				var futureIndex = this.computeFutureIndex(relatedContext, evt);
				VueUtil.merge(draggedContext, {
					futureIndex: futureIndex
				});
				VueUtil.merge(evt, {
					relatedContext: relatedContext,
					draggedContext: draggedContext
				});
				return onMove(evt);
			},
			onDragEnd: function(evt) {
				this.computeIndexes();
				draggingElement = null;
			}
		}
	};
	Vue.component(VueSortable.name, VueSortable);
});
