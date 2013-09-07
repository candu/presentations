function visualizeData(ds) {
  ds = ds.map(processRow);
  var filter = crossfilter(ds);
  var dim = filter.dimension(function (d) {
    return d.daysTaken;
  });
  var chart = barChart()
    .dimension(dim)
    .group(dim.group(Math.floor))
    .x(d3.scale.linear()
        .domain([0, 85])
        .rangeRound([0, 850]));
  var charts = [chart, chart];
  var chartDivs = d3.selectAll('.chart')
    .data(charts);

  function renderAll() {
    chartDivs.each(function(method) {
      d3.select(this).call(method);
    });
  }

  renderAll();
}

function processRow(d) {
  var start = new Date(d.Date_Complete_Received),
      end = new Date(d.Decision_Communicated),
      dt = end - start,
      daysTaken = Math.round(dt / (1000 * 60 * 60 * 24));
  return {daysTaken: daysTaken};
}

function loadData() {
  d3.csv('data/csv/FOI_2012.csv', visualizeData);
}

window.onload = function() {
  loadData();
};
