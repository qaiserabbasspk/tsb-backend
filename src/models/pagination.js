const mongoose = require("mongoose");

class PaginationModel {
  constructor() {
    this.page;
    this.pages;
    this.pageSize;
    this.rows;
    this.data = [];
  }
}

module.exports = PaginationModel;
