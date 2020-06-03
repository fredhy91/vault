import { isPresent } from '@ember/utils';
import { alias } from '@ember/object/computed';
import { inject as service } from '@ember/service';
import Controller from '@ember/controller';
import { copy } from 'ember-copy';
import { resolve } from 'rsvp';

const DEFAULTS = {
  token: null,
  id: null,
  loading: false,
  errors: [],
  primary_api_addr: null,
  primary_cluster_addr: null,
  filterConfig: {
    mode: null,
    paths: [],
  },
};

export default Controller.extend(copy(DEFAULTS, true), {
  isModalActive: false,
  store: service(),
  rm: service('replication-mode'),
  replicationMode: alias('rm.mode'),
  flashMessages: service(),

  submitError(e) {
    if (e.errors) {
      this.set('errors', e.errors);
    } else {
      throw e;
    }
  },

  saveFilterConfig() {
    const config = this.get('filterConfig');
    const id = this.get('id');
    config.id = id;
    // if there is no mode, then they don't want to filter, so we don't save a filter config
    if (!config.mode) {
      return resolve();
    }
    const configRecord = this.get('store').createRecord('path-filter-config', config);
    return configRecord.save().catch(e => this.submitError(e));
  },

  reset() {
    this.setProperties(copy(DEFAULTS, true));
  },

  submitSuccess(resp, action) {
    const cluster = this.get('model');
    if (!cluster) {
      return;
    }

    if (resp && resp.wrap_info) {
      this.set('token', resp.wrap_info.token);
    }
    if (action === 'secondary-token') {
      this.setProperties({
        loading: false,
        primary_api_addr: null,
        primary_cluster_addr: null,
      });
      // open modal
      this.toggleProperty('isModalActive');
      return cluster.reload();
    }
    this.reset();
    this.send('refresh');
    return;
  },

  submitHandler(action, clusterMode, data, event) {
    const replicationMode = this.get('replicationMode');
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    this.setProperties({
      loading: true,
      errors: [],
    });
    if (data) {
      data = Object.keys(data).reduce((newData, key) => {
        var val = data[key];
        if (isPresent(val)) {
          newData[key] = val;
        }
        return newData;
      }, {});
    }

    return this.get('store')
      .adapterFor('cluster')
      .replicationAction(action, replicationMode, clusterMode, data)
      .then(
        resp => {
          return this.saveFilterConfig().then(() => {
            return this.submitSuccess(resp, action, clusterMode);
          });
        },
        (...args) => this.submitError(...args)
      );
  },

  actions: {
    onSubmit(/*action, mode, data, event*/) {
      return this.submitHandler(...arguments);
    },
    toggleModal(successMessage) {
      if (!!successMessage && typeof successMessage === 'string') {
        this.get('flashMessages').success(successMessage);
      }
      this.toggleProperty('isModalActive');
      this.transitionToRoute('mode.secondaries');
    },
    clear() {
      this.reset();
      this.setProperties({
        token: null,
        id: null,
      });
    },
    refresh() {
      // bubble to the route
      return true;
    },
  },
});
