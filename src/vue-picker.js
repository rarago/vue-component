!(function(name, context, definition) {
	'use strict';
	if (typeof define === 'function' && define.amd) {
		define(['Vue', 'VueUtil', 'VuePopper', 'VueInput'], definition);
	} else {
		context[name] = definition(context['Vue'], context['VueUtil'], context['VuePopper'], context['VueInput']);
	}
})('VuePicker', this, function(Vue, VueUtil, VuePopper, VueInput) {
	'use strict';
	var NewPopper = {
		props: {
			appendToBody: VuePopper().props.appendToBody,
			offset: VuePopper().props.offset,
			boundariesPadding: VuePopper().props.boundariesPadding
		},
		methods: VuePopper().methods,
		data: VuePopper().data,
		beforeDestroy: VuePopper().beforeDestroy
	};
	var DEFAULT_FORMATS = {
		date: 'yyyy-MM-dd',
		month: 'yyyy-MM',
		datetime: 'yyyy-MM-dd HH:mm:ss',
		time: 'HH:mm:ss',
		timerange: 'HH:mm:ss',
		week: 'yyyywWW',
		daterange: 'yyyy-MM-dd',
		datetimerange: 'yyyy-MM-dd HH:mm:ss',
		year: 'yyyy'
	};
	var HAVE_TRIGGER_TYPES = ['date', 'datetime', 'time', 'time-select', 'week', 'month', 'year', 'daterange', 'timerange', 'datetimerange'];
	var DATE_FORMATTER = function(value, format) {
		return VueUtil.formatDate(value, format);
	};
	var DATE_PARSER = function(text, format) {
		return VueUtil.parseDate(text, format);
	};
	var RANGE_FORMATTER = function(value, format, separator) {
		if (Array.isArray(value) && value.length === 2) {
			var start = value[0];
			var end = value[1];
			if (start && end) {
				return VueUtil.formatDate(start, format) + separator + VueUtil.formatDate(end, format);
			}
		}
		return '';
	};
	var RANGE_PARSER = function(text, format, separator) {
		var array = text.split(separator);
		if (array.length === 2) {
			var range1 = array[0];
			var range2 = array[1];
			return [VueUtil.parseDate(range1, format), VueUtil.parseDate(range2, format)];
		}
		return [];
	};
	var TYPE_VALUE_RESOLVER_MAP = {
		default: {
			formatter: function(value) {
				if (!value)
					return '';
				return '' + value;
			},
			parser: function(text) {
				if (text === undefined || text === '')
					return null;
				return text;
			}
		},
		week: {
			formatter: function(value, format) {
				var date = VueUtil.formatDate(value, format);
				var week = VueUtil.component.getWeekNumber(value);
				date = /WW/.test(date) ? date.replace(/WW/, week < 10 ? '0' + week : week) : date.replace(/W/, week);
				return date;
			},
			parser: function(text) {
				var array = (text || '').split('w');
				if (array.length === 2) {
					var year = Number(array[0]);
					var month = Number(array[1]);
					if (!isNaN(year) && !isNaN(month) && month < 54) {
						return text;
					}
				}
				return null;
			}
		},
		date: {
			formatter: DATE_FORMATTER,
			parser: DATE_PARSER
		},
		datetime: {
			formatter: DATE_FORMATTER,
			parser: DATE_PARSER
		},
		daterange: {
			formatter: RANGE_FORMATTER,
			parser: RANGE_PARSER
		},
		datetimerange: {
			formatter: RANGE_FORMATTER,
			parser: RANGE_PARSER
		},
		timerange: {
			formatter: RANGE_FORMATTER,
			parser: RANGE_PARSER
		},
		time: {
			formatter: DATE_FORMATTER,
			parser: DATE_PARSER
		},
		month: {
			formatter: DATE_FORMATTER,
			parser: DATE_PARSER
		},
		year: {
			formatter: DATE_FORMATTER,
			parser: DATE_PARSER
		},
		number: {
			formatter: function(value) {
				if (!value)
					return '';
				return '' + value;
			},
			parser: function(text) {
				var result = Number(text);
				if (!isNaN(text)) {
					return result;
				} else {
					return null;
				}
			}
		}
	};
	var PLACEMENT_MAP = {
		left: 'bottom-start',
		center: 'bottom-center',
		right: 'bottom-end'
	};
	var VuePicker = {
		template: '<vue-input class="vue-date-editor" :class="\'vue-date-editor--\' + type" :readonly="readonly" :disabled="disabled" :size="size" v-clickoutside="handleClose" :placeholder="placeholder" @focus="handleFocus" @blur="handleBlur" @keydown.native="handleKeydown" :value="displayValue" @change.native="displayValue = $event.target.value" :validateEvent="false" ref="reference" ><i slot="icon" class="vue-input__icon" @click="handleClickIcon" :class="[showClose ? \'vue-icon-close\' : triggerClass]" @mouseenter="handleMouseEnterIcon" @mouseleave="showClose = false" v-if="haveTrigger"></i></vue-input>',
		mixins: [VueUtil.component.emitter, NewPopper],
		props: {
			size: String,
			format: String,
			readonly: {
				type: Boolean,
				default: true
			},
			placeholder: String,
			disabled: Boolean,
			clearable: {
				type: Boolean,
				default: true
			},
			popperClass: String,
			align: {
				type: String,
				default: 'left'
			},
			value: {},
			defaultValue: {},
			rangeSeparator: {
				default: ' - '
			},
			pickerOptions: {}
		},
		components: {
			VueInput: VueInput()
		},
		directives: {
			Clickoutside: VueUtil.component.clickoutside()
		},
		data: function() {
			return {
				pickerVisible: false,
				showClose: false,
				currentValue: '',
				unwatchPickerOptions: null
			};
		},
		watch: {
			pickerVisible: function(val) {
				if (!val)
					this.dispatch('VueFormItem', 'vue.form.blur');
				if (this.disabled)
					return;
				val ? this.showPicker() : this.hidePicker();
			},
			currentValue: function(val) {
				if (val)
					return;
				if (this.picker && typeof this.picker.handleClear === 'function') {
					this.picker.handleClear();
				} else {
					this.$emit('input');
				}
			},
			value: {
				immediate: true,
				handler: function(val) {
					this.currentValue = VueUtil.isDate(val) ? new Date(val) : val;
				}
			},
			displayValue: function(val) {
				this.$emit('change', val);
				this.dispatch('ElFormItem', 'el.form.change');
			}
		},
		computed: {
			reference: function() {
				return this.$refs.reference.$el;
			},
			refInput: function() {
				if (this.reference)
					return this.reference.querySelector('input');
				return {};
			},
			valueIsEmpty: function() {
				var val = this.currentValue;
				if (Array.isArray(val)) {
					for (var i = 0, len = val.length; i < len; i++) {
						if (val[i]) {
							return false;
						}
					}
				} else {
					if (val) {
						return false;
					}
				}
				return true;
			},
			triggerClass: function() {
				return this.type.indexOf('time') !== -1 ? 'vue-icon-time' : 'vue-icon-date';
			},
			selectionMode: function() {
				if (this.type === 'week') {
					return 'week';
				} else if (this.type === 'month') {
					return 'month';
				} else if (this.type === 'year') {
					return 'year';
				}
				return 'day';
			},
			haveTrigger: function() {
				if (typeof this.showTrigger !== 'undefined') {
					return this.showTrigger;
				}
				return HAVE_TRIGGER_TYPES.indexOf(this.type) !== -1;
			},
			displayValue: {
				get: function() {
					var value = this.currentValue;
					if (!value)
						return;
					var formatter = (TYPE_VALUE_RESOLVER_MAP[this.type] || TYPE_VALUE_RESOLVER_MAP['default']).formatter;
					var format = DEFAULT_FORMATS[this.type];
					return formatter(value, this.format || format, this.rangeSeparator);
				},
				set: function(value) {
					if (value) {
						var type = this.type;
						var parser = (TYPE_VALUE_RESOLVER_MAP[type] || TYPE_VALUE_RESOLVER_MAP['default']).parser;
						var parsedValue = parser(value, this.format || DEFAULT_FORMATS[type], this.rangeSeparator);
						if (parsedValue && this.picker) {
							this.picker.value = parsedValue;
						}
					} else {
						this.$emit('input', value);
						this.picker.value = value;
					}
					this.$forceUpdate();
				}
			}
		},
		created: function() {
			this.popperOptions = {
				boundariesPadding: 0,
				gpuAcceleration: false
			};
			this.placement = PLACEMENT_MAP[this.align] || PLACEMENT_MAP.left;
		},
		methods: {
			handleMouseEnterIcon: function() {
				if (this.disabled)
					return;
				if (!this.valueIsEmpty && this.clearable) {
					this.showClose = true;
				}
			},
			handleClickIcon: function() {
				if (this.disabled)
					return;
				if (this.showClose) {
					this.currentValue = this.$options.defaultValue || '';
					this.showClose = false;
				} else {
					this.pickerVisible = !this.pickerVisible;
				}
			},
			dateChanged: function(dateA, dateB) {
				if (Array.isArray(dateA)) {
					var len = dateA.length;
					if (!dateB)
						return true;
					while (len--) {
						if (!VueUtil.equalDate(dateA[len], dateB[len]))
							return true;
					}
				} else {
					if (!VueUtil.equalDate(dateA, dateB))
						return true;
				}
				return false;
			},
			handleClose: function() {
				this.pickerVisible = false;
			},
			handleFocus: function() {
				var type = this.type;
				if (HAVE_TRIGGER_TYPES.indexOf(type) !== -1 && !this.pickerVisible) {
					this.pickerVisible = true;
				}
				this.$emit('focus', this);
			},
			handleBlur: function() {
				this.$emit('blur', this);
			},
			handleKeydown: function(event) {
				var keyCode = event.keyCode;
				if (keyCode === 9) {
					this.pickerVisible = false;
				}
			},
			hidePicker: function() {
				if (this.picker) {
					this.picker.resetView && this.picker.resetView();
					this.pickerVisible = this.picker.visible = false;
					this.destroyPopper();
				}
			},
			showPicker: function() {
				if (this.$isServer) return;
				var self = this;
				if (!self.picker) {
					self.mountPicker();
				}
				self.pickerVisible = self.picker.visible = true;
				self.updatePopper();
				if (self.currentValue instanceof Date) {
					self.picker.date = new Date(self.currentValue.getTime());
				} else {
					self.picker.value = self.currentValue;
				}
				self.picker.resetView && self.picker.resetView();
				self.$nextTick(function() {
					self.picker.ajustScrollTop && self.picker.ajustScrollTop();
				});
			},
			mountPicker: function() {
				var self = this;
				self.panel.defaultValue = self.defaultValue || self.currentValue;
				self.picker = new Vue(self.panel).$mount();
				self.picker.popperClass = self.popperClass;
				self.popperElm = self.picker.$el;
				self.picker.width = self.reference.getBoundingClientRect().width;
				self.picker.showTime = self.type === 'datetime' || self.type === 'datetimerange';
				self.picker.selectionMode = self.selectionMode;
				if (self.format) {
					self.picker.format = self.format;
				}
				var updateOptions = function() {
					var options = self.pickerOptions;
					if (options && options.selectableRange) {
						var ranges = options.selectableRange;
						var parser = TYPE_VALUE_RESOLVER_MAP.datetimerange.parser;
						var format = DEFAULT_FORMATS.timerange;
						ranges = Array.isArray(ranges) ? ranges : [ranges];
						self.picker.selectableRange = ranges.map(function(range) {return parser(range, format, self.rangeSeparator);});
					}
					for (var option in options) {
						if (options.hasOwnProperty(option) && option !== 'selectableRange') {
							self.picker[option] = options[option];
						}
					}
				};
				updateOptions();
				self.unwatchPickerOptions = self.$watch('pickerOptions', function() {updateOptions();}, { deep: true });
				self.$el.appendChild(self.picker.$el);
				self.picker.resetView && self.picker.resetView();
				self.picker.$on('dodestroy', self.doDestroy);
				self.picker.$on('pick', function(date, visible) {
					date = date||'';
					visible = visible||false;
					self.$emit('input', date);
					self.pickerVisible = self.picker.visible = visible;
					self.picker.resetView && self.picker.resetView();
				});
				self.picker.$on('select-range', function(start, end) {
					self.refInput.setSelectionRange(start, end);
					self.refInput.focus();
				});
			},
			unmountPicker: function() {
				if (this.picker) {
					this.picker.$destroy();
					this.picker.$off();
					if (typeof this.unwatchPickerOptions === 'function') {
						this.unwatchPickerOptions();
					}
					VueUtil.removeNode(this.picker.$el);
				}
			}
		}
	};
	return function() {
		return VuePicker;
	}
});
