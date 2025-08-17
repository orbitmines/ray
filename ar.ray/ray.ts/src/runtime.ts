namespace Runtime {
  /**
   * TODO Contexts with parent contexts
   *      Separate contexts for the objects (this/self contexts)
   *      Override variables vs stack variables (how to choose?)
   *        Variable disambiguation through selection of them (visualize somehow)
   *      Contexts for programming languages (Within this "ts" context, you have access to all these language primitives)
   *        Variables can be types of grammars,
   *        Separate context for the context within a block of the programming language vs the context defining the program
   *        Different behavior for the context depending on the programming language.
   *      Multiple contexts selected. ; Parent, or two different projects with the same variables.
   *      Loaded context: Open/selected files in a project, how is this accessed?
   *        Or is it just a variable
   */
  export class Context {
    __get__ = (variable: any): any => {

    }
    __set__ = (variable: any, value: any): void => {

    }
  }

}
export default Runtime;