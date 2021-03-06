var debug = false;

var viz = {

    data: null, // holds data to be binded

    width: 1220,
    chart_top: 80,
    windowHeight: 620,
    margin: 50,
    radius: 2.5,
    trans: 200,
    
    svg: null, // holds svg element

    stats: [{"key":"pts", "label":"Points"},
            {"key":"reb", "label":"Rebounds"},
            {"key":"asts","label":"Assists"},
            {"key":"blk", "label":"Blocks"},
            {"key":"stl", "label":"Steals"},
            {"key":"fgm", "label":"FG"},
            {"key":"tpm", "label":"3FG"},
            {"key":"ftm", "label":"Free Throws"}],
    
    filters: [{"id":"Fame","label":"Hall of Fame","v":1},
              {"id":"Star","label":"All-Star","v":2}],
    
    colors: [{"color":"#FDB462", "inUse":false},
        	 {"color":"#B3DE69", "inUse":false},
         	 {"color":"#FCCDE5", "inUse":false},
         	 {"color":"#BC80BD", "inUse":false},
         	 {"color":"#8DD3C7", "inUse":false},
         	 {"color":"#FCCD35", "inUse":false}],

    stats_buttons: null,
    filter_buttons: null,
    sorter_buttons: null,
    // save state of selected options
    state: {"stat":null, "filter":null, "selection":null, "selections":[],
        "sorter": function() {
            var key = this.stat.key;
            return function(x, y) { return d3.ascending(x.totals[key], y.totals[key]);};
        }
    },

    year_scale: null,
    tot_scale: null,

    players: null, // holds binded data elements (for lines and info)
    bars: null, // holds binded data elements (for bar graph)
    tot_axis: null, // holds axis since it is subject to change based on selected stat and viewport
    year_axis: null, // holds axis since it is subject to change based on viewport
    legend: null,

    linegen: null, // line generator
    force: null, // force layout for collision detection
    
    // build menus and initialize properties and methods
    init: function() {
        var w_h = +d3.select('html').style('height').slice(0,-2);
        this.chart_top = (w_h > 750) ? 150 : this.chart_top;
        this.windowHeight = (w_h > 750) ? w_h - 120 : this.windowHeight;

        var w_w = +d3.select('html').style('width').slice(0,-2);
        if (w_w > 1440) w_w = 1440;
        else if (w_w < 1280) w_w = 1280;
        this.width = w_w - 60;

        var self = this;
        this.svg = d3.select("#chart");

        d3.select("#opers")
          .append('div')
          .attr('id', 'stats')
          .text("View: ");

        this.stats_buttons = d3.select("#stats")
            .selectAll("span")
            .data(this.stats)
            .enter()
            .append("span")
            .html(function(d, i) {
                var span = '<span class="button';
                if (i == 0) span += ' selected';
                span += '">' + d.label + '</span>';
                if (i < self.stats.length - 1) span += ' | ';
                return span;
            });
        this.state.stat = this.stats[0];
        this.stats_buttons.on("click", function(d) {
            d3.select("#stats")
              .selectAll("span.button")
              .classed('selected', false);
            d3.select(this)
              .select('span')
              .classed('selected', true);
            self.state.stat = d;
            self.update();
        });

        d3.select("#opers")
          .append("div")
          .attr('id', 'filter')
          .text('Filter: ');

        this.filter_buttons = d3.select('#filter')
            .selectAll("span")
            .data(this.filters)
            .enter()
            .append("span")
            .html(function(d, i) {
                var span = '<span class="button selected" id="' + d.id + '">' + d.label + '</span>';
                if (i < self.filters.length - 1) span += ' | ';
                return span;
            });
        this.state.filter = 3;
        this.filter_buttons.on("click", function(d) {
            if ((self.state.filter ^ d.v) == 0 || (self.state.filter ^ d.v) == 3) {
                self.state.filter = 3;
                d3.select("#filter")
                  .selectAll("span.button")
                  .classed('selected', true);
            }
            else {
                self.state.filter = self.state.filter ^ d.v;
                d3.select(this)
                  .select('span')
                  .classed('selected', false);
            }
            self.update();
        });

        this.draw();
    },
    // initialize chart
    draw: function() {
        var self = this;

        this.year_scale = d3.scale.ordinal()
            .rangeRoundBands([this.margin, this.width - this.margin])
            .domain(d3.range(1, 22).map(function(d) { return d; }));

        this.tot_scale = d3.scale.linear()
            .range([this.windowHeight, this.chart_top])
            .domain(this.extent());

        this.year_axis = d3.svg.axis()
            .scale(this.year_scale)
            .ticks(21);

        this.tot_axis = d3.svg.axis()
            .scale(this.tot_scale)
            .orient("left");

        this.svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', "translate(" + (0.25 * this.margin) + "," + (this.windowHeight) + ")")
            .call(this.year_axis);

        this.svg.append('g')
            .attr('class', 'y axis')
            .attr('transform', "translate(" + (1.25 * this.margin) + ",0)")
            .call(this.tot_axis);
            
        this.force = d3.layout.force()
            .nodes(this.data)
            .gravity(0.0)
            .charge(-1)
            .chargeDistance(20)
            .size([this.width,this.windowHeight - this.chart_top])
            .on("tick", tick);
        
        this.data.forEach(function(d) {
           var len = d.career.length - 1;
           d.x = self.year_scale(d.career[len].years);
           d.y = self.tot_scale(d.career[len][self.state.stat.key]);
           d.hide = false;
        });               
            
        this.players = this.svg.selectAll("g")
            .data(this.data, function(d) { return d ? d.ilkid : this.id; })
            .enter()
            .append("g")
            .sort(this.state.sorter())
            .attr('transform', "translate(" + (0.25 * this.margin + 0.5 * this.year_scale.rangeBand()) + ",0)")
            .classed('allstar', function(d) {
                if (d.active) return true;
                else return false;
            })
            .classed('hof', function(d) {
                if (d.hall_of_fame) return true;
                else return false;
            });

        this.players
            .append('circle')
            .classed('button', true)
            .attr('cx',function(d) { return d.x; })
            .attr('cy',function(d) { return d.y; })
            .attr('r',this.radius)
            .on("click", function(d) {
                if (self.state.selections.length < 6 && self.state.selections.indexOf(d) < 0) {
                    d.hide = false;
                    self.state.selections.push(d);
                    self.updateSelections();
                }
                else if (-1 < self.state.selections.indexOf(undefined)) {
                    var i = self.state.selections.indexOf(undefined);
                    d.hide = false;
                    self.state.selections[i] = d;
                    self.updateSelections();
                }
                if (self.state.selection == d) {
                    d3.select("#name")
                      .text("");

                    d3.select("#xp")
                      .text("");

                    d3.select("#stat")
                      .text("");

                    d3.selectAll('g.player')
                      .classed('highlight', false);

                    d3.select("#link")
                      .style('display', 'none');

                    self.state.selection = null;
                    return;
                }

                self.state.selection = d;
                self.updateInfo();
            })
            .on("mouseover", function(d) {
                d.hide = false;
                
                var datum = d;

                d3.select("#name")
                  .text(d.firstname + " " + d.lastname + ", " + d.position);

                d3.select("#xp")
                  .text("Experience: " + d.career.length + " years, " + d.firstyear + "-" + d.lastyear)

                d3.select("#stat")
                  .text(function(d) {
                      var text = "Career total: " + datum.totals[self.state.stat.key] + " " + self.state.stat.label;
                      if (self.state.stat.label.slice(-2) == "FG") text += "s made";
                      return text;
                  });

                d3.selectAll("g.player text")
                  .style('display',function(d) {
                      if (d.hide) return "none";
                      else return null;
                  });
                
                d3.selectAll('g.player')
                  .classed('highlight', function(d) {
                      if (d == datum) return true;
                      else return false;
                  });

                d3.select("#link")
                  .style('display', 'none');

            })
            .on("mouseout", function(d) {
                d3.select("#name")
                  .text("");

                d3.select("#xp")
                  .text("");

                d3.select("#stat")
                  .text("");

                self.updateInfo();

                d3.selectAll("g.player text")
                  .style('display',function(d) {
                      if (d.hide) return "none";
                      else return null;
                  });
                
                d3.selectAll('g.player')
                  .classed('highlight', false);

                d3.selectAll('g.player')
                  .classed('highlight', function(d) {
                      if (d == self.state.selection) return true;
                      else return false;
                  });
                
                self.updateSelections();
            })
            
        this.linegen = d3.svg.line()
            .interpolate('cardinal')
            .x(function(d,i) { return this.year_scale(d.years); })
            .y(function(d) { return this.tot_scale(d[self.state.stat.key]); });

        this.players
            .append('path')
            .attr('d', function(d) { return self.linegen(d.career); })
            .attr('fill', 'none')
            .style('display', 'none');

        this.players
            .append('line')
            .classed('start', true)
            .attr('x1', this.year_scale(1))
            .attr('y1', this.tot_scale(0))
            .attr('x2', this.year_scale(1))
            .attr('y2', function(d) { return self.tot_scale(d.career[0][self.state.stat.key]); })
            .style('display', 'none');

        this.players
            .classed('player', true)
            .append('text')
            .classed('button', true)
            .text(function(d) { return d.firstname + " " + d.lastname; })
            .on("click", function(d) {
                if (self.state.selections.length < 6 && self.state.selections.indexOf(d) < 0) {
                    self.state.selections.push(d);
                    self.updateSelections();
                }
                else if (-1 < self.state.selections.indexOf(undefined)) {
                    var i = self.state.selections.indexOf(undefined);
                    self.state.selections[i] = d;
                    self.updateSelections();
                }
                if (self.state.selection == d) {
                    d3.select("#name")
                      .text("");

                    d3.select("#xp")
                      .text("");

                    d3.select("#stat")
                      .text("");

                    d3.selectAll('g.player')
                      .classed('highlight', false);

                    d3.select("#link")
                      .style('display', 'none');

                    self.state.selection = null;
                    return;
                }

                self.state.selection = d;
                self.updateInfo();
            })
            .on("mouseover", function(d) {
                var datum = d;

                d3.select("#name")
                  .text(d.firstname + " " + d.lastname + ", " + d.position);

                d3.select("#xp")
                  .text("Experience: " + d.career.length + " years, " + d.firstyear + "-" + d.lastyear)

                d3.select("#stat")
                  .text(function(d) {
                      var text = "Career total: " + datum.totals[self.state.stat.key] + " " + self.state.stat.label;
                      if (self.state.stat.label.slice(-2) == "FG") text += "s made";
                      return text;
                  });

                d3.selectAll('g.player')
                  .classed('highlight', function(d) {
                      if (d == datum) return true;
                      else return false;
                  });

                d3.select("#link")
                  .style('display', 'none');

            })
            .on("mouseout", function(d) {

                d3.select("#name")
                  .text("");

                d3.select("#xp")
                  .text("");

                d3.select("#stat")
                  .text("");

                self.updateInfo();

                d3.selectAll('g.player')
                  .classed('highlight', false);

                d3.selectAll('g.player')
                  .classed('highlight', function(d) {
                      if (d == self.state.selection) return true;
                      else return false;
                  });
            })
        
        this.legend = d3.selectAll("#legend")
            .selectAll('div')
            .data(this.state.selections, function(d) { return d ? d.ilkid : this.id; });

        this.svg.append('text')
            .attr('class', 'label')
            .attr('transform', "translate(" + (0.5 * this.width - this.margin) + "," + (this.windowHeight + 40) + ")")
            .text("Year (in career)");
            
        this.force.start();
        
        function tick(e) {
            self.players.each(moveTowardDataPosition(e.alpha));
            self.players.each(collide(e.alpha));
            
            self.players.selectAll('circle')
                .transition()
                .duration(self.trans)
                .attr('cy',function(d) { return d.y; })
                .attr('cx',function(d) { return d.x; });
            
            self.players.selectAll('text')
                .style('display',function(d) {
                    if (self.state.selections.indexOf(d) > -1) d.hide = false; 
                    if (d.hide) return "none";
                    else return null;
                })
                .transition()
                .duration(self.trans)
                .attr('y',function(d) { return d.y + self.radius; })
                .attr('x',function(d) { return d.x + self.radius + 2; });
        }
        
        function moveTowardDataPosition(alpha) {
            return function(d) {
                var len = d.career.length - 1;
                d.x += (self.year_scale(d.career[len].years) - d.x);
                d.y += (self.tot_scale(d.career[len][self.state.stat.key]) - d.y);
                d.hide = false;
            };
        }
        
        function collide(alpha) {
            var quadtree = d3.geom.quadtree(self.data);
            return function(d) {
                var r = self.radius * 2,
                    nx1 = d.x - self.radius,
                    nx2 = d.x + self.radius,
                    ny1 = d.y - self.radius,
                    ny2 = d.y + self.radius;
                quadtree.visit(function(quad, x1, y1, x2, y2) {
                    if (quad.point && (quad.point !== d)) {
                        var x = d.x - quad.point.x,
                            y = d.y - quad.point.y,
                            l = Math.sqrt(x * x + y * y),
                            di = self.radius * 2;
                        if (l < di) {
                            l = 0.75 * Math.sqrt(di * di - l * l);
                            d.x -= l;
                            quad.point.x += l;
                            d.hide = true;
                            quad.point.hide = true;
                        }
                    }
                    return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
                });
            };
        }
    },
    // Find min/max of current stat for entire dataset
    extent: function() {
        var min = [],
            max = [];
        var self = this;

        for (i = 0; i < this.data.length; i++) {
            min.push(d3.min(this.data[i]['career'], function(d) { return d[self.state.stat.key]; }));
            max.push(d3.max(this.data[i]['career'], function(d) { return d[self.state.stat.key]; }));
        }
        return [d3.min(min), d3.max(max)];
    },
    // animate user selected options (sort, filter, statistic)
    update: function() {
        if (debug) console.log(this.state);
        this.tot_scale = d3.scale.linear()
            .range([this.windowHeight, this.chart_top])
            .domain(this.extent());

        this.tot_axis = d3.svg.axis()
            .scale(this.tot_scale)
            .orient("left");

        var self = this;

        this.data.forEach(function(d) {
           var len = d.career.length - 1;
           d.y = self.tot_scale(d.career[len][self.state.stat.key]);
           d.hide = false;
        });               
            
        this.svg.select('g.y')
            .transition()
            .duration(250)
            .call(this.tot_axis);

        this.svg.selectAll('g.player path')
            .transition()
            .duration(400)
            .attr('d', function(d) { return self.linegen(d.career); });

        this.svg.selectAll('g.player line.start')
            .transition()
            .duration(250)
            .attr('y2', function(d) { return self.tot_scale(d.career[0][self.state.stat.key]); });

        var plyrs = this.svg.selectAll("g.player")
            .sort(this.state.sorter())
            .classed('filter', function(d) {
                if (self.state.filter == 1 && d.active) return true;
                if (self.state.filter == 2 && !d.active) return true;
                if (d.totals[self.state.stat.key] == 0) return true;
                return false;
            });
        this.trans = 200;    
        this.force.resume();

        this.updateInfo();
    },
    // update lines with selected players
    updateSelections: function() {
        var self = this;
        
        this.players.selectAll('g.player text')
            .style('display', function(d) {
                if (d.hide) return "none";
                else return null;
            });
        
        this.svg.selectAll('g.player path')
            .style('display', function(d) {
                if (self.state.selections.indexOf(d) > -1) return "inline";
                else return "none";
            })
            .attr('stroke', function(d) {
                if (self.state.selections.indexOf(d) < 0) return 'black';
                else return self.colors[self.state.selections.indexOf(d)].color;
            });

        this.svg.selectAll('g.player line.start')
            .style('display', function(d) {
                if (self.state.selections.indexOf(d) > -1) return "inline";
                else return "none";
            })
            .attr('stroke', function(d) {
                if (self.state.selections.indexOf(d) < 0) return 'black';
                else return self.colors[self.state.selections.indexOf(d)].color;
            });

        this.legend = d3.selectAll("#legend")
            .selectAll('div')
            .data(this.state.selections, function(d) { return d ? d.ilkid : this.id; });

        this.legend
            .enter()
            .append('div')
            .classed('name', true)
            .text(function(d) { return d.firstname + ' ' + d.lastname + ' '; })
            .style('border-bottom', function(d, i) {
                return '1px solid ' + self.colors[i].color;
            })
            .on("mouseover", function(d) {
                var datum = d;

                d3.select("#name")
                  .text(d.firstname + " " + d.lastname + ", " + d.position);

                d3.select("#xp")
                  .text("Experience: " + d.career.length + " years, " + d.firstyear + "-" + d.lastyear)

                d3.select("#stat")
                  .text(function(d) {
                      var text = "Career total: " + datum.totals[self.state.stat.key] + " " + self.state.stat.label;
                      if (self.state.stat.label.slice(-2) == "FG") text += "s made";
                      return text;
                  });

                d3.selectAll('g.player')
                  .classed('highlight', function(d) {
                      if (d == datum) return true;
                      else return false;
                  });

                d3.select("#link")
                  .style('display', 'none');

            })
            .on("mouseout", function(d) {

                d3.select("#name")
                  .text("");

                d3.select("#xp")
                  .text("");

                d3.select("#stat")
                  .text("");

                self.updateInfo();

                d3.selectAll('g.player')
                  .classed('highlight', false);

                d3.selectAll('g.player')
                  .classed('highlight', function(d) {
                      if (d == self.state.selection) return true;
                      else return false;
                  });
            })
            .append('span')
            .classed('button', true)
            .html('&times;')
            .on("click", function(d) {
                var i = self.state.selections.indexOf(d);
                self.state.selections = self.state.selections.slice(0, i)
                    .concat(self.state.selections.slice(i + 1, self.state.selections.length));
                self.colors = self.colors.slice(0, i)
                    .concat(self.colors.slice(i + 1, 6))
                    .concat(self.colors.slice(i, i + 1));
                self.updateSelections();
                d3.select("#name")
                  .text("");

                d3.select("#xp")
                  .text("");

                d3.select("#stat")
                  .text("");

                self.updateInfo();
            });

        this.legend.exit().remove();
        this.force.resume();
    },
    // update display with information of highlighted player
    updateInfo: function() {
        var self = this;

        if (this.state.selections.length < 1) return;

        var d = this.state.selections[this.state.selections.length - 1];

        if (d === null) return;

        d3.select("#name")
          .text(d.firstname + " " + d.lastname + ", " + d.position);

        d3.select("#xp")
          .text("Experience: " + d.career.length + " years, " + d.firstyear + "-" + d.lastyear)

        d3.select("#stat")
          .text(function(e) {
              var text = "Career total: " + d.totals[self.state.stat.key] + " " + self.state.stat.label;
              if (self.state.stat.label.slice(-2) == "FG") text += "s made";
              return text;
          });
        // provide link to player's data in data source
        d3.select("#href")
          .attr('href','http://www.basketball-reference.com/players/' + d.lastname.slice(0, 1).toLowerCase() + '/' + d.ilkid.toLowerCase() + '.html');

        d3.select('#link')
          .style('display', 'block');
    },
    // resize chart based on viewport
    resize: function() {
        var self = this;
        var new_width = +d3.select("html").style("width").slice(0,-2);
   	    var new_height = +d3.select("html").style("height").slice(0,-2);
        if (debug) console.log(new_width + "x" + new_height);
        if (new_width > 1440) new_width = 1440;
        else if (new_width < 1280) new_width = 1280;
        this.width = new_width - 60;
        if (new_height < 750) {
            new_height = 720;
            this.chart_top = 80;
        }
        else this.chart_top = 150;
        this.windowHeight = new_height - 120;

        this.year_scale = d3.scale.ordinal()
            .rangeRoundBands([this.margin, this.width - this.margin])
            .domain(d3.range(1, 22).map(function(d) { return d; }));

        this.tot_scale = d3.scale.linear()
            .range([this.windowHeight, this.chart_top])
            .domain(this.extent());

        this.year_axis = d3.svg.axis()
            .scale(this.year_scale)
            .ticks(21);

        this.svg.select('g.x')
            .attr('transform', "translate(" + (0.25 * this.margin) + "," + (this.windowHeight) + ")")
            .call(this.year_axis);

        this.svg.select('text.label')
            .attr('transform', "translate(" + (0.5 * this.width - this.margin) + "," + (this.windowHeight + 40) + ")");

        this.tot_axis = d3.svg.axis()
            .scale(this.tot_scale)
            .orient("left");

        this.svg.select('g.y')
            .call(this.tot_axis);
        
        this.svg.selectAll('g.player path')
            .attr('d', function(d) { return self.linegen(d.career); });

        this.svg.selectAll('g.player line.start')
            .attr('x1', this.year_scale(1))
            .attr('y1', this.tot_scale(0))
            .attr('x2', this.year_scale(1))
            .attr('y2', function(d) { return self.tot_scale(d.career[0][self.state.stat.key]); });
        
        this.force.size([this.width, this.windowHeight - this.chart_top]);
        this.trans = 0;
        this.force.resume();
    }
};

d3.json('data/player_data.json', function(d) {

    viz.data = d;
    viz.init();
});

d3.select(window)
  .on("resize", function() {
        viz.resize();
  });

if (+d3.select("html").style("height").slice(0, -2) < 750) {
    d3.select("#summary")
      .style("display", "block")
      .style("opacity", 1)
      .transition()
      .duration(10000)
      .style("opacity", 0);

    setTimeout(function() {
        d3.select("#summary")
          .style("opacity", null)
          .style("display", null);
    }, 11000);
}