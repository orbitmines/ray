### Targets
#### [[Category Theory]]
[[Categorica]]


---

```ts
to_wolfram_language = (): string => {  
  const hyperEdges: string[][] = [];  
  const options: any = {};  
  const labels: string[] = [];  
  
  const vertexStyle = (reference: Option<Ray>): string => {  
    switch (reference.force().type()) {  
      case RayType.INITIAL:{  
        return 'Darker@Red'  
      }  
      case RayType.TERMINAL: {  
        return 'Lighter@Red'  
      }  
      case RayType.REFERENCE: {  
        return 'Orange'  
      }  
      case RayType.VERTEX: {  
        return 'Lighter@Blue'  
      }  
    }  
  }  
  const get = (reference: Option<Ray>): Option<string> => {  
    const vertex = reference.match({ Some: (ref) => ref.vertex(), None: () => Option.None });  
    if (vertex.is_some()) {  
      const label = vertex.force()._label;  
      if (!labels.includes(label))  
        return Option.None;  
  
      return Option.Some(vertex.force().label);  
    }  
  
    return Option.None;  
  }  
  
  this.compile<string, string[]>({  
    directionality: {  
      new: () => {  
        const edge: string[] = [];  
        hyperEdges.push(edge);  
        return edge;  
      },  
      push_back: function (directionality: string[], ray: Option<string>): void {  
        if (ray.is_some())  
          directionality.push(ray.force());  
      }  
    },  
    convert: function (reference: Option<Ray>): Option<string> {  
      const existing = get(reference);  
      if (existing.is_some())  
        return existing;  
  
      if (reference.is_none() || reference.force().vertex().is_none())  
        return Option.None;  
  
      const vertex = reference.force().vertex();  
  
      const name: string = `"${vertex.force().js().match({  
        Some: (js) => js.toString(),  
        None: () => `?`  
      })} (${vertex.force().label})"`;  
  
      (options['VertexStyle'] ??= {})[name] = vertexStyle(reference);  
  
      labels.push(vertex.force().label)  
  
      return Option.Some(name);  
    },  
    get,  
  });  
  
  return `ResourceFunction["WolframModelPlot"][{${hyperEdges  
    .filter(hyperEdge => hyperEdge.length !== 0)  
    .map(hyperEdge =>  
      `{${hyperEdge.join(',')}}`  
    ).join(',')}},VertexLabels->All,${  
      _.map(options, (mapping, option) =>  
        `${option} -> <|${  
          _.map(mapping, (value, key) => `${key} -> ${value}`)  
            .join(',')}|>`)  
        .join(',')}]`;  
}

to_wolfram_language = (): string => {  
  const hyperEdges: string[][] = [];  
  const options: any = {};  
  
  const debug = {};  
  this.debug(debug);  
  
  const vertexStyle = (ray: any): string => {  
    switch (ray.type) {  
      case RayType.INITIAL:{  
        return 'Darker@Red'  
      }  
      case RayType.TERMINAL: {  
        return 'Lighter@Red'  
      }  
      case RayType.REFERENCE: {  
        if (ray.vertex === 'None') // empty reference  
          return 'Lighter@Orange';  
  
        return 'Orange'  
      }  
      case RayType.VERTEX: {  
        return 'Lighter@Blue'  
      }  
      default: {  
        throw '??'  
      }  
    }  
  }  
  
  _.valuesIn(debug).forEach((ray: any) => {  
    console.log(ray)  
  
    if (ray.initial !== 'None' && ray.terminal !== 'None') {  
      const edge: string[] = [ray.initial, ray.label, ray.terminal].filter(vertex => vertex !== 'None');  
      hyperEdges.push(edge);  
    }  
  
    if (ray.vertex !== 'None') {  
      hyperEdges.push([ray.label, ray.vertex]);  
  
      (options['EdgeStyle'] ??= {})[`{${[ray.label, ray.vertex].join(',')}}`] = 'Orange'  
    }  
  
    (options['VertexStyle'] ??= {})[ray.label] = vertexStyle(ray);  
  })  
  
  return `ResourceFunction["WolframModelPlot"][{${hyperEdges  
    .filter(hyperEdge => hyperEdge.length !== 0)  
    .map(hyperEdge =>  
      `{${hyperEdge.join(',')}}`  
    ).join(',')}},VertexLabels->All,${  
    _.map(options, (mapping, option) =>  
      `${option} -> <|${  
        _.map(mapping, (value, key) => `${key} -> ${value}`)  
          .join(',')}|>`)  
      .join(',')}]`;  
}

```