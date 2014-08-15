function needDispatch() {
  var gen = Dispatcher.current();
  Dispatcher.wait(gen, null);
}

function wait(waitGen) {
  var gen = Dispatcher.current();
  Dispatcher.wait(gen, waitGen);
}

function waitv(/* waitGen, ... */) {
  var gen = Dispatcher.current();
  var waitGens = Array.prototype.slice.call(arguments);
  Dispatcher.wait(gen, waitGens);
}

function waitva(waitGens) {
  var gen = Dispatcher.current();
  Dispatcher.wait(gen, waitGens);
};

function Result(value) {
  this.value = value;
}

function result(value) {
  return new Result(value);
}

var NodeType = {
  LEAF: 1,
  WAIT: 2,
  WAITV: 3
};

function CallGraphNode(id, waitIds) {
  this._id = id;
  this._waitIds = {};
  if (waitIds === null) {
    this._type = NodeType.LEAF;
  } else if (!(waitIds instanceof Array)) {
    this._type = NodeType.WAIT;
    this._waitIds[waitIds] = true;
  } else {
    this._type = NodeType.WAITV;
    _.each(waitIds, function(waitId) {
      this._waitIds[waitId] = true;
    }.bind(this));
  }
  this._result = null;
  this._hasResult = false;
}
CallGraphNode.prototype.type = function() {
  return this._type;
};
CallGraphNode.prototype.waitIds = function() {
  return _.keys(this._waitIds);
};
CallGraphNode.prototype.setResult = function(result) {
  this._result = result;
  this._hasResult = true;
};
CallGraphNode.prototype.hasResult = function() {
  return this._hasResult;
};
CallGraphNode.prototype.result = function() {
  return this._result;
};

function CallGraph() {
  this._gens = [];
  this._nodes = {};
  this._result = null;
  this._hasResult = false;
}
CallGraph.prototype.id = function(gen) {
  var genId = _.indexOf(this._gens, gen);
  if (genId !== -1) {
    return genId;
  }
  genId = this._gens.length;
  this._gens.push(gen);
  this.setNode(gen, null);
  return genId;
};
CallGraph.prototype.gen = function(genId) {
  return this._gens[genId];
};
CallGraph.prototype.setNode = function(gen, waitGens) {
  var genId = this.id(gen);
  this._nodes[genId] = new CallGraphNode(genId, null);
  if (waitGens === null) {
    this._nodes[genId] = new CallGraphNode(genId, null);
  } else if (!(waitGens instanceof Array)) {
    var waitId = this.id(waitGens);
    this._nodes[genId] = new CallGraphNode(genId, waitId);
  } else {
    var waitIds = _.map(waitGens, this.id.bind(this));
    this._nodes[genId] = new CallGraphNode(genId, waitIds);
  }
};
CallGraph.prototype.setResult = function(gen, result) {
  var genId = this.id(gen);
  this._nodes[genId].setResult(result);
};
CallGraph.prototype.hasResult = function(gen) {
  var genId = this.id(gen);
  return this._nodes[genId].hasResult();
};
CallGraph.prototype.result = function(gen) {
  var genId = this.id(gen);
  return this._nodes[genId].result();
};
CallGraph.prototype.getRunnableIds = function() {
  var runnableIds = [];
  _.each(this._nodes, function(node, genId) {
    var waitIds = node.waitIds();
    var waitGensFinished = _.every(waitIds, function(waitId) {
      return this._nodes[waitId].hasResult();
    }.bind(this));
    if (waitGensFinished && !node.hasResult()) {
      runnableIds.push(genId);
    }
  }.bind(this));
  return runnableIds;
};
CallGraph.prototype.getSendValue = function(gen) {
  var genId = this.id(gen);
  var node = this._nodes[genId];
  var waitIds = node.waitIds();
  if (node.type() === NodeType.WAIT) {
    var waitNode = this._nodes[waitIds[0]];
    return waitNode.result();
  }
  return _.map(waitIds, function(waitId) {
    var waitNode = this._nodes[waitId];
    return waitNode.result();
  }.bind(this));
};

var Dispatcher = {
  _graph: new CallGraph(),
  _current: null
};
Dispatcher.current = function() {
  return this._current;
};
Dispatcher.dispatch = function() {
  DT.dispatch();
};
Dispatcher.runOneStep = function(gen, sendValue) {
  var oldCurrent = this._current;
  this._current = gen;
  var yielded = gen.next(sendValue);
  if (yielded.done) {
    var id = this._graph.id(gen);
    throw new Error('must yield result!');
  } else if (yielded.value instanceof Result) {
    this._graph.setResult(gen, yielded.value.value);
  }
  this._current = oldCurrent;
};
Dispatcher.wait = function(gen, waitGens) {
  this._graph.setNode(gen, waitGens);
  if (waitGens === null) {
    return;
  }
  if (!(waitGens instanceof Array)) {
    waitGens = [waitGens];
  }
  _.each(waitGens, function(waitGen) {
    this.runOneStep(waitGen);
  }.bind(this));
};
Dispatcher.run = function(root) {
  this._current = root;
  this.wait(root, null);
  while (!this._graph.hasResult(root)) {
    // first, dispatch
    this.dispatch();
    // next, run generators
    var runnable = this._graph.getRunnableIds();
    _.each(runnable, function(genId) {
      var gen = this._graph.gen(genId);
      var sendValue = this._graph.getSendValue(gen);
      this.runOneStep(gen, sendValue);
    }.bind(this));
  }
  return this._graph.result(root);
};
