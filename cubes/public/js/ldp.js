var LDP = function() {};

(function($) {

	/**
	 * Service constructor
	 */
	LDP.Service = function(config) {
		this.url = config.url;
		this.rows = config.rows || 10;
		this.dimensionHandlers = {};
		this.cut = {};
	};

	/**
	 * Set handler for dimensions
	 */
	LDP.Service.prototype.addDimension = function(dimension, handler) {
		this.dimensionHandlers[dimension] = handler;
		this.dimensionHandlers[dimension].service = this;
	};

	/**
	 * Page setup - fetch all models
	 */
	LDP.Service.prototype.run = function() {
		this.sendRequest('model', 'model');
	};

	/**
	 * Re-fetch all dimensions using the current cut
	 */
	LDP.Service.prototype.update = function() {

		var values = [];
		for(var dimension in this.cut) {
			values.push(dimension + ':' + this.cut[dimension]);
		}

		var cut = values.join('|');

		// Get values for each dimension
		for (var cube in this.model.cubes) {
			for (var i = 0; i < this.model.cubes[cube].dimensions.length; i++) {

				var dimensionName = this.model.cubes[cube].dimensions[i];
				var dimensionData = this.model.dimensions[dimensionName].levels[dimensionName];

				var requestVars = {};
				requestVars.cut = cut;

				if (!(dimensionName in this.cut)) {
					requestVars.drilldown = dimensionName;
				}

				this.sendRequest(
					'dimension',
					'cube/' + this.model.cubes[cube].name + '/aggregate',
					requestVars,
					{
						label: this.model.dimensions[dimensionName].label,
						name: dimensionData.name,
						key: dimensionData.name + '.' + dimensionData.key,
						cube_name: this.model.cubes[cube].name,
						cube_label: this.model.cubes[cube].label
					}
				);

			}
		}

	};
	/**
	 * Add value to filter on
	 */
	LDP.Service.prototype.addCut = function(dimension, value) {
		this.cut[dimension] = value;
	};

	/**
	 * Remove value to filter on
	 */
	LDP.Service.prototype.removeCut = function(dimension) {
		delete this.cut[dimension];
	};

	/**
	 * Send a request to the cubes API
	 */
	LDP.Service.prototype.sendRequest = function(type, action, data, extraData) {
		$.ajax({
			url: this.url + '/' + action,
			type: 'GET',
			data: $.extend(
				{ pagesize: this.rows },
				data
			),
			dataType: 'json',
			context: this,
			success: function(data, textStatus, jqXHR) {
				this.processResponse(type, action, $.extend(extraData, data));
			}
		});
	}

	/**
	 * Process response from cubes API
	 */
	LDP.Service.prototype.processResponse = function(type, action, data) {

		switch(type) {

			case 'model':
				this.model = data;
				this.update();
				break;

			case 'dimension':
				if (!(data.name in this.dimensionHandlers)) {
					console.log('Unknown dimension: ' + data.name);
					return;
				}
				this.dimensionHandlers[data.name].processResponse(data);
				break;

			default:
				console.log('Unknown action: ' + action);
				break;

		}

	};

	/**
	 * Dimension namespace
	 */
	LDP.Dimension = function() {};

	/**
	 * Utility function to format a number for human consumption
	 */
	LDP.Dimension.numFormat = function(num) {
		num += '';
		x = num.split('.');
		x1 = x[0];
		x2 = x.length > 1 ? '.' + x[1] : '';
		var rgx = /(\d+)(\d{3})/;
		while (rgx.test(x1)) {
			x1 = x1.replace(rgx, '$1' + ',' + '$2');
		}
		return x1 + x2;
	};

	/**
	 * Utility function to add/replace a dimension
	 */
	LDP.Dimension.addDimension = function(container, name, label, content) {

		var dimension = $('#dimension_' + name);
		if (dimension.size()) {

			// Replace existing dimension
			dimension
				.next()
					.remove()
				.end()
				.after(content);

		} else {

			// Add new dimension
			container
				.append('<h2 id="dimension_' + name + '">' + label + '</h2>')
				.append(content);

		}

	};

	/**
	 * Utility function to format a dimension value
	 */
	LDP.Dimension.formatValue = function(name, value) {
		return name + ' (' + LDP.Dimension.numFormat(value) + ')';
	};

	/**
	 * List Dimension constructor
	 */
	LDP.Dimension.List = function(config) {
		config = config || {};

		this.service = null;

		this.container = config.container || '#dimensions';
		this.container = $(this.container);
	};

	LDP.Dimension.List.prototype.processResponse = function(dimension) {
		if (dimension.total_cell_count == null) {
			this.single(dimension);
		} else {
			this.multi(dimension);
		}
	};

	LDP.Dimension.List.prototype.single = function(dimension) {

		var service = this.service;

		var removeLink = $('<a href="#">x</a>')
			.click(function() {
				service.removeCut(dimension.name);
				service.update();
				return false;
			});

		var list = $('<ul></ul>').append(
			$('<li></li>')
				.append(LDP.Dimension.formatValue(dimension.summary[dimension.key], dimension.summary.value_sum) + ' ')
				.append(removeLink)
		);

		LDP.Dimension.addDimension(this.container, dimension.name, dimension.label, list);

	};

	LDP.Dimension.List.prototype.multi = function(dimension) {

		var list = $('<ul></ul>');

		for (var i = 0; i < dimension.drilldown.length; i++) {
			list.append(this.multiItem(dimension, dimension.drilldown[i]));
		}

		LDP.Dimension.addDimension(this.container, dimension.name, dimension.label, list);

	}

	LDP.Dimension.List.prototype.multiItem = function(dimension, curDimension) {

		var service = this.service;

		var link = $('<a href="#">' + LDP.Dimension.formatValue(curDimension[dimension.key], curDimension.value_sum) + '</a>')
			.click(function() {
				service.addCut(dimension.name, curDimension[dimension.key]);
				service.update();
				return false;
			});

		return $('<li></li>').append(link);

	};


	/**
	 * BarChart Dimension constructor
	 */
	LDP.Dimension.BarChart = function(config) {
		config = config || {};

		this.service = null;

		this.container = $(config.container || '#dimensions');

		this.barWidth = config.barWidth || 250;
		this.barHeight = config.barHeight || 20;

		this.textX = config.textX || -3;
		this.textY = config.textY || '.35em';
		this.textAnchor = config.textAnchor || 'end';

		this.scale = config.scale || this.scale;
	};

	LDP.Dimension.BarChart.prototype.processResponse = function(dimension) {
		if (dimension.total_cell_count == null) {
			this.single(dimension);
		} else {
			this.multi(dimension);
		}
	};

	LDP.Dimension.BarChart.prototype.single = function(dimension) {

		var service = this.service;

		// Create link to remove cut for current dimension and show all values
		var removeLink = $('<a href="#" class="showAll">Show All</a>')
			.click(function() {
				service.removeCut(dimension.name);
				service.update();
				return false;
			});

		// Create single line bar chart
		var bar = '<svg class="barChart static" width="' + this.barWidth + '" height="' + this.barHeight + '">';
		bar += '<rect y="0" width="' + this.barWidth + '" height="' + this.barHeight + '"></rect>';
		bar += '<text x="' + this.barWidth + '" y="' + (this.barHeight / 2) + '" dx="' + this.textX + '" dy="' + this.textY + '" text-anchor="' + this.textAnchor + '">';
		bar += LDP.Dimension.formatValue(dimension.summary[dimension.key], dimension.summary.value_sum) + '</text></svg>';

		// Add content to page
		var content = $('<div></div>')
			.append(bar)
			.append(removeLink);
		LDP.Dimension.addDimension(this.container, dimension.name, dimension.label, content);

	};

	LDP.Dimension.BarChart.prototype.multi = function(dimension) {

		var handler = this;
		var data = dimension.drilldown.map(function (d) {
			return d.value_sum
		});
		var scale = this.scale(data);

		// Create bar chart
		var chartContainer = $('<div></div>');
		var chart = d3.select(chartContainer.get(0))
			.append('svg:svg')
				.attr('class', 'barChart')
				.attr('width', this.barWidth)
				.attr('height', this.barHeight * data.length);

		// Create bars
		var bars = chart.selectAll('rect')
				.data(data)
			.enter().append('svg:rect')
				.attr('y', function(d, i) { return i * handler.barHeight; })
				.attr('width', scale)
				.attr('height', this.barHeight)
				.on('click', function(d, i) {
					handler.service.addCut(dimension.name, dimension.drilldown[i][dimension.key]);
					handler.service.update();
				});

		// Create bar labels
		chart.selectAll('text')
				.data(data)
			.enter().append('svg:text')
				.attr('x', scale)
				.attr('y', function(d, i) { return (i * handler.barHeight) + (handler.barHeight/2); })
				.attr('dx', this.textX)
				.attr('dy', this.textY)
				.attr('text-anchor', this.textAnchor)
				.text(function (d, i) {
					return LDP.Dimension.formatValue(dimension.drilldown[i][dimension.key], d);
				})
				.on('click', function(d, i) {
					// Pass click event to bar's handler
					var rect = $(this).parent().children('rect').get(i);
					(d3.select(rect).on('click'))(d, i);
				});

		// Add chart to page
		LDP.Dimension.addDimension(this.container, dimension.name, dimension.label, chartContainer);

	};

	LDP.Dimension.BarChart.prototype.scale = function(data) {
		return d3.scale.linear()
			.domain([0, d3.max(data)])
			.range([0, this.barWidth]);
	};

	/**
	 * Geo Dimension constructor
	 */
	LDP.Dimension.Geo = function(config) {
		config = config || {};

		this.service = null;

		// What data to place in the tooltips
		this.formatFeatureToolTip = config.formatFeatureToolTip || this.formatFeatureToolTip;

		// Where to render the map
		this.container = config.container || '#geo';

		// Default to grayscale colour range
		this.colourMin = config.colourMin || "#fff";
		this.colourMax = config.colourMax || "#000";

		// Prefix to target GeoJSON features (defaults to dimension's name and an undescore)
		this.featureIdPrefix = config.featureIdPrefix || null;

		// Default to view of UK (assuming longitude and latitude using WGS84 datum)
		this.projection = d3.geo.albers()
			.scale(config.scale || 6000)
			.origin(config.origin || [1, 54]);

		this.path = d3.geo.path()
			.projection(this.projection);

		this.chart = d3.select(this.container)
			.append('svg:svg');

		this.geo = this.chart.append('svg:g')
			.attr('id', config.id || 'geo_chart');

		this.isLoaded = false;

		var handler = this;
		d3.json(config.url || 'geo.json', function(json) {

			handler.geo.selectAll("path")
				.data(json.features)
			.enter().append("svg:path")
				.attr("id", handler.getId)
				.attr("d", handler.path);

			handler.isLoaded = true;

		});
	};

	LDP.Dimension.Geo.prototype.processResponse = function(dimension) {

		// Defer processing if the geo data hasn't loaded yet
		if (!this.isLoaded) {
			var handler = this;
			window.setTimeout(function() { handler.processResponse(dimension); }, 200);
			return;
		}

		// Get colour range for the current set of values
		var colourScale = d3.scale.linear()
			.domain([
				d3.min(dimension.drilldown, this.getValue),
				d3.max(dimension.drilldown, this.getValue)
			])
			.range([this.colourMin, this.colourMax])

		// Get prefix for GeoJSON features IDs' (the suffix is always the dimension value)
		var prefix = (this.featureIdPrefix == null) ? dimension.name + '_' : this.featureIdPrefix;

		// Set each dimension value's area to the appropriate colour
		for (var i = 0; i < dimension.drilldown.length; i++) {

			this.setFeatureValue(
				'#' + prefix + dimension.drilldown[i][dimension.key],
				dimension.drilldown[i],
				colourScale
			);

		}

	};

	LDP.Dimension.Geo.prototype.setFeatureValue = function(featureId, data, colourScale) {

		var handler = this;

		$(featureId)
			.css('fill', colourScale(data.value_sum))
			.unbind('mousemove')
			.unbind('mouseout')
			.mousemove(function(e) {

				if (!this.tooltip) {

					this.tooltip = $('<div class="tooltip"></div>')
						.css('position', 'absolute')
						.appendTo('body');

				}

				this.tooltip
					.html(handler.formatFeatureToolTip(featureId, data, colourScale))
					.css({
						left: (e.pageX - 20) + "px",
						top: (e.pageY - 45) + "px"
					})
					.show();

			})
			.mouseout(function(e) {
				if (this.tooltip) {
					this.tooltip.hide();
				}
			});

	};

	LDP.Dimension.Geo.prototype.formatFeatureToolTip = function(featureId, data, colourScale) {
		return LDP.Dimension.numFormat(data.value_sum);
	};

	LDP.Dimension.Geo.prototype.getId = function(d) {
		return d.id;
	};

	LDP.Dimension.Geo.prototype.getValue = function(d) {
		return d.value_sum;
	};

})(jQuery);
