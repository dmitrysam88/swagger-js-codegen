const beauty = require('js-beautify').js;
const fs = require('fs');
const { inspect } = require('util');

/**
 * Expose definitions objects, create files with objects
 * @param {object} definitions - object that contain definitions objects
 * @param {array} methods - array of the available methods
 * @param {string} path - where to generate the files, resulting path will be path/<directory>
 * @param {string} directory - name of the directory
 */
function expose(definitions, methods, path, directory) {
  try {
    // get list of the definitions
    const list = Object.keys(definitions);

    // do not proceed if there are no definitions
    if (list.length === 0) {
      return console.log('> swagger-js-codegen @ No objects to expose!');
    }

    // make sure that ~/definitions directory exists
    const container = `${path}/${directory}`;
    if (!fs.existsSync(container)) {
      fs.mkdirSync(container);
    }

    // process definitions
    list.forEach(async (definition) => {
      // bind the parameters
      let parameters = '';
      const props = Object.keys(definitions[definition].properties);
      if (props.length && props.length > 0) {
        props.forEach((prop) => {
          const { type,format } = definitions[definition].properties[prop];
          if (type) {
            if (type === 'string' && format === 'date-time') {
              parameters = `${parameters}
                  this.data['${prop}'] = params['${prop}'].replace(/T/, ' ').replace('Z', '');`;
            }else if (type === 'array') {
              const { items } = definitions[definition].properties[prop];
              if (items) {
                if (items['$ref']) {
                  const refName = items['$ref'].split('/').slice(-1)[0];
                  Array.isArray()
                  parameters = `${parameters}
                    this.data['${prop}'] = [];
                    if(!params['${prop}'])params['${prop}'] = []
                    if (params['${prop}'].length && params['${prop}'].length > 0) {
                      params['${prop}'].forEach((object) => {
                      const ${refName} = new global.classes['${refName}'](req, res, object);
                      this.data.${prop}.push(${refName}.data);
                    });
                  }`;
                } else {
                  parameters = `${parameters}
                    this.data['${prop}'] = params['${prop}'];`;
                }
              } else {
                parameters = `${parameters}
                  this.data['${prop}'] = params['${prop}'];`;
              }
            } else {
              parameters = `${parameters}
                this.data['${prop}'] = params['${prop}'];`;
            }
          } else {
            if (definitions[definition].properties[prop]['$ref']) {
              const refName = definitions[definition].properties[prop]['$ref'].split('/').slice(-1)[0];
              parameters = `${parameters}
                this['${refName}'] = new global.classes['${refName}'](req, res, params['${prop}']);
                this.data['${prop}'] = this['${refName}'].data;
                `;
            }
          }
        });
      }

      // check x-AuthFieldType field
      const secure = [];
      if (!(definitions[definition].properties instanceof Array)) {
        const properties = Object.keys(definitions[definition].properties);
        properties.forEach((property) => {
          if (definitions[definition].properties[property]['x-AuthFieldType']) {
            methods.forEach((method) => {
              method.parameters.forEach((parameter) => {
                if (parameter.name === definition) {
                  secure.push({
                    type: parameter['in'],
                    definition,
                    property,
                    value: definitions[definition].properties[property]['x-AuthFieldType'],
                    parameter_type:definitions[definition].properties[property].type
                  });
                }
              });
            });
          }
        });
      } else {
        definitions[definition].properties.forEach((property, i) => {
          if (property['x-AuthFieldType']) {
            methods.forEach((method) => {
              method.parameters.forEach((parameter) => {
                if (parameter.name === definition) {
                  secure.push({
                    type: parameter['in'],
                    definition,
                    property,
                    value: property['x-AuthFieldType'],
                    parameter_type:property.type
                  });
                }
              })
            });
          }
        });
      }


      // add validation
      let validation = '';
      if (secure.length > 0) {
        validation = '';
        secure.forEach((property) => {
          let origin = property.type;
          if (origin === 'path') {origin = 'req.params' }else {origin = 'this.data'}
          validation = `
          async validate() {
            try {
              ${origin}['${property.property}'] = await global.FieldValidator.validate('${property.value}','${property.parameter_type}',${origin}['${property.property}'], this.req, this.res)
            } catch (error) {
              console.log('validation error', error);
              throw new Error(error.message);
            }
          }
        `;
        });
      }

      // compile the file
      const content = `/* auto-generated: ${definition}.js */
    
        module.exports = class {
          constructor(req = {}, res = {}, params = {}) {
            this.req = req;
            this.res = res;
            this.params = params;
            this.data = {};
            ${parameters}
            this.schema = ${inspect(definitions[definition], { showHidden: false, depth: null })}; 
          }
          ${validation}  
        };`;

      // make sure that destination definition directory exists
      const destination = `${container}/${definition}`;
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination);
      }

      // create file in the destination folder
      fs.writeFileSync(`${destination}/${definition}.js`,
          beauty(content, { indent_size: 2 }),
          (err) => {
            if (err) {
              throw new Error(err.message || err);
            }
          });
    });
  } catch (err) {
    throw new Error(err.message || err);
  }
}

module.exports = expose;
